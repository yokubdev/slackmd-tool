import OpenAI from "openai";
import { createObjectCsvWriter } from "csv-writer";
import * as fs from "fs";
import * as path from "path";

export interface AnalysisResult {
  answer: "yes" | "no";
  confidence?: number;
  promotionData?: PromotionData;
}

export interface PromotionData {
  title: string;
  date: string;
  categories: PromotionCategory[];
}

export interface PromotionCategory {
  [key: string]: string | number;
}

export const analyzeDiscountRequest = async (
  message: string
): Promise<AnalysisResult> => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.warn("OPENAI_API_KEY not found, using fallback analysis");
    return fallbackAnalysis(message);
  }

  try {
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    const prompt = `Analyze this promotion message and extract ALL relevant structured data:

Message: "${message}"

Please extract ANY and ALL relevant information from this promotion message in JSON format. The structure should be completely dynamic based on what information is actually present in the message:

{
  "isPromotion": true/false,
  "promotionData": {
    "title": "promotion name or title if mentioned",
    "date": "any date information if mentioned",
    "categories": [
      {
        // Include ANY fields that are mentioned in the message
        // Examples: product names, discount amounts, prices, dates, conditions, exclusions, limits, etc.
        // Do NOT limit to specific fields - include everything relevant
        // Field names should match what's actually in the message
      }
    ]
  }
}

If this is not a promotion request, return:
{
  "isPromotion": false,
  "promotionData": null
}

IMPORTANT: 
- Include ALL fields mentioned in the message, not just predefined ones
- Field names should match the actual content (e.g., "product", "item", "merchandise", "discount", "price", "validity", "conditions", etc.)
- Do NOT assume any specific structure - let the message content determine the fields
- If multiple products/categories are mentioned, create separate entries for each
- IMPORTANT: Exclusions should be included as a field in EACH product row, NOT as a separate row
- Each product should have its own row with all relevant information including exclusions

Only return valid JSON, no other text.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that analyzes promotion messages and extracts ALL relevant structured data. Always respond with valid JSON only. Do NOT assume any predefined structure - let the actual message content determine what fields to include. Include every piece of relevant information mentioned in the message. IMPORTANT: Exclusions should be included as a field in each product row, NOT as a separate row.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 1500,
      temperature: 0.1,
    });

    const response = completion.choices[0]?.message?.content?.trim();
    console.log("OpenAI Response:", response);

    try {
      const parsedResponse = JSON.parse(response || "{}");
      console.log("parsedResponse=====:", response);

      if (parsedResponse.isPromotion && parsedResponse.promotionData) {
        return {
          answer: "yes",
          promotionData: parsedResponse.promotionData,
        };
      } else {
        return { answer: "no" };
      }
    } catch (parseError) {
      console.error("Error parsing OpenAI response:", parseError);
      const promotionData = extractPromotionData(message);
      if (promotionData) {
        return {
          answer: "yes",
          promotionData: promotionData,
        };
      }
      return { answer: "no" };
    }
  } catch (error) {
    console.error("Error analyzing message with OpenAI:", error);
    return fallbackAnalysis(message);
  }
};

const fallbackAnalysis = (message: string): AnalysisResult => {
  const discountKeywords = [
    "discount",
    "promotion",
    "sale",
    "off",
    "mattress",
    "merchandise",
    "moonlight madness",
    "red tag",
    "special order",
    "map merchandise",
    "fabric protection",
    "warranty",
    "exclude from sale",
  ];

  const dollarKeywords = ["$", "dollar", "dollars", "off"];
  const productKeywords = ["mattress", "merchandise", "product", "item"];

  const hasDiscountContent = discountKeywords.some((keyword) =>
    message.toLowerCase().includes(keyword.toLowerCase())
  );

  const hasDollarContent = dollarKeywords.some((keyword) =>
    message.toLowerCase().includes(keyword.toLowerCase())
  );

  const hasProductContent = productKeywords.some((keyword) =>
    message.toLowerCase().includes(keyword.toLowerCase())
  );

  const isRequest =
    message.includes("?") ||
    message.toLowerCase().includes("can you") ||
    message.toLowerCase().includes("please") ||
    message.toLowerCase().includes("make") ||
    message.toLowerCase().includes("active");

  const answer =
    hasDiscountContent && hasDollarContent && hasProductContent && isRequest
      ? "yes"
      : "no";

  return { answer };
};

const extractPromotionData = (message: string): PromotionData | null => {
  try {
    const titleMatch = message.match(/([A-Za-z\s]+)\s+promotion/i);
    const dateMatch = message.match(
      /(?:for\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i
    );

    const title = titleMatch
      ? titleMatch[1].trim() + " Promotion"
      : "Promotion";
    const date = dateMatch ? dateMatch[1] : "";

    const categories: PromotionCategory[] = [];

    const patterns = [
      /([A-Za-z\s&]+)\s*-\s*(\d+)%\s+Off/gi,
      /([A-Za-z\s&]+)\s*-\s*\$(\d+)\s+Off/gi,
      /([A-Za-z\s&]+)\s+\$(\d+)\s+Off/gi,
      /(\d+)%\s+Off\s+(?:all\s+)?(?:merchandise|products?)/gi,
    ];

    const foundEntries = new Set<string>();

    let globalExclusions = "";
    const exclusionMatch = message.match(
      /(?:excludes?|exclusions?)[^.]*(?:merchandise|products?|items?)[^.]*\./gi
    );
    if (exclusionMatch) {
      const exclusionText = exclusionMatch[0]
        .replace(/excludes?|exclusions?/gi, "")
        .trim();
      if (exclusionText) {
        globalExclusions = exclusionText.replace(/\.$/, "");
      }
    }

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const productName = match[1]?.trim() || "All Merchandise";
        const discountAmount = match[2];
        const entryKey = `${productName}-${discountAmount}`;

        if (foundEntries.has(entryKey)) continue;
        foundEntries.add(entryKey);

        const categoryData: PromotionCategory = {};

        if (productName.toLowerCase().includes("mattress")) {
          categoryData.product = productName;
        } else if (productName.toLowerCase().includes("merchandise")) {
          categoryData.merchandise = productName;
        } else {
          categoryData.item = productName;
        }

        if (pattern.source.includes("%")) {
          categoryData.discount = `${discountAmount}% Off`;
        } else {
          categoryData.discount = `$${discountAmount} Off`;
        }

        if (globalExclusions) {
          categoryData.exclusions = globalExclusions;
        }

        const validityMatch = message.match(
          /(?:valid|until|through)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i
        );
        if (validityMatch) {
          categoryData.validity = validityMatch[1];
        }

        const priceMatch = message.match(
          /(?:price|cost):\s*\$?(\d+(?:\.\d{2})?)/i
        );
        if (priceMatch) {
          categoryData.price = priceMatch[1];
        }

        const quantityMatch = message.match(/(?:limit|max|maximum)\s+(\d+)/i);
        if (quantityMatch) {
          categoryData.limit = quantityMatch[1];
        }

        const conditionMatch = message.match(
          /(?:condition|terms?):\s*([^.]+)/i
        );
        if (conditionMatch) {
          categoryData.conditions = conditionMatch[1].trim();
        }

        const definitionMatch = message.match(
          /(?:definition|sku|code):\s*([^\n]+)/i
        );
        if (definitionMatch) {
          categoryData.definition = definitionMatch[1].trim();
        }

        categories.push(categoryData);
      }
    });

    if (categories.length === 0) {
      return null;
    }

    return {
      title: title,
      date: date,
      categories: categories,
    };
  } catch (error) {
    console.error("Error extracting promotion data:", error);
    return null;
  }
};

export const createPromotionCSV = async (
  promotionData: PromotionData
): Promise<string> => {
  const timestamp = new Date().getTime();
  const filename = `promotion_${timestamp}.csv`;
  const filepath = path.join(process.cwd(), "temp", filename);

  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const headers = generateDynamicHeaders(promotionData.categories);

  const csvWriter = createObjectCsvWriter({
    path: filepath,
    header: headers,
  });

  await csvWriter.writeRecords(promotionData.categories);

  return filepath;
};

const generateDynamicHeaders = (
  categories: PromotionCategory[]
): Array<{ id: string; title: string }> => {
  if (categories.length === 0) {
    return [];
  }

  const allKeys = new Set<string>();
  categories.forEach((category) => {
    Object.keys(category).forEach((key) => {
      allKeys.add(key);
    });
  });

  const headers = Array.from(allKeys).map((key) => ({
    id: key,
    title: key.charAt(0).toUpperCase() + key.slice(1),
  }));

  return headers;
};
