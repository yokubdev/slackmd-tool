import OpenAI from 'openai';

export interface AnalysisResult {
  answer: 'yes' | 'no';
  confidence?: number;
  promotionData?: PromotionData;
}

export interface PromotionData {
  title: string;
  date: string;
  categories: PromotionCategory[];
}

export interface PromotionCategory {
  category: string;
  discount: string;
  definition: string;
  exclusions: string;
}

export const analyzeDiscountRequest = async (message: string): Promise<AnalysisResult> => {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not found, using fallback analysis');
    return fallbackAnalysis(message);
  }
  
  try {
    // Initialize OpenAI client inside the function
    const apiKey = process.env.OPENAI_API_KEY 
    console.log('Using API key:', apiKey.substring(0, 20) + '...');
    
    const openai = new OpenAI({
      apiKey: apiKey,
    });

    const prompt = `Analyze this promotion message and extract structured data:

Message: "${message}"

Please extract the following information in JSON format:
{
  "isPromotion": true/false,
  "promotionData": {
    "title": "promotion name",
    "date": "promotion date if mentioned",
    "categories": [
      {
        "category": "product name",
        "discount": "discount amount",
        "definition": "SKUs, Minor Code Tags, or other identifiers",
        "exclusions": "exclusion text"
      }
    ]
  }
}

If this is not a promotion request, return:
{
  "isPromotion": false,
  "promotionData": null
}

Only return valid JSON, no other text.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that analyzes promotion messages and extracts structured data. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.1,
    });

    const response = completion.choices[0]?.message?.content?.trim();
    console.log('OpenAI Response:', response);
    
    try {
      const parsedResponse = JSON.parse(response || '{}');
      
      if (parsedResponse.isPromotion && parsedResponse.promotionData) {
        return {
          answer: 'yes',
          promotionData: parsedResponse.promotionData
        };
      } else {
        return { answer: 'no' };
      }
    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      // Fallback to local extraction
      const promotionData = extractPromotionData(message);
      if (promotionData) {
        return {
          answer: 'yes',
          promotionData: promotionData
        };
      }
      return { answer: 'no' };
    }
  } catch (error) {
    console.error('Error analyzing message with OpenAI:', error);
    // Fallback to keyword-based analysis
    return fallbackAnalysis(message);
  }
};

// Fallback analysis using keyword matching
const fallbackAnalysis = (message: string): AnalysisResult => {
  const discountKeywords = [
    'discount',
    'promotion',
    'sale',
    'off',
    'mattress',
    'merchandise',
    'moonlight madness',
    'red tag',
    'special order',
    'map merchandise',
    'fabric protection',
    'warranty',
    'exclude from sale'
  ];
  
  const dollarKeywords = ['$', 'dollar', 'dollars', 'off'];
  const productKeywords = ['mattress', 'merchandise', 'product', 'item'];
  
  const hasDiscountContent = discountKeywords.some(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
  
  const hasDollarContent = dollarKeywords.some(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
  
  const hasProductContent = productKeywords.some(keyword => 
    message.toLowerCase().includes(keyword.toLowerCase())
  );
  
  const isRequest = message.includes('?') || 
                   message.toLowerCase().includes('can you') ||
                   message.toLowerCase().includes('please') ||
                   message.toLowerCase().includes('make') ||
                   message.toLowerCase().includes('active');
  
  const answer = (hasDiscountContent && hasDollarContent && hasProductContent && isRequest) ? 'yes' : 'no';
  
  return { answer };
};

// Function to extract promotion data from message
const extractPromotionData = (message: string): PromotionData | null => {
  try {
    // Extract title and date
    const titleMatch = message.match(/([A-Za-z\s]+)\s+promotion/i);
    const dateMatch = message.match(/(?:for\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
    
    const title = titleMatch ? titleMatch[1].trim() + ' Promotion' : 'Promotion';
    const date = dateMatch ? dateMatch[1] : '';
    
    // Extract categories and discounts dynamically
    const categories: PromotionCategory[] = [];
    
    // Dynamic pattern to find any product with discount
    // This will match patterns like:
    // "Product Name - $X Off" or "Product Name - X% Off"
    // "Product Name - $X Off\nDefinition: Some definition"
    const discountPatterns = [
      // Percentage off pattern
      /([A-Za-z\s&]+)\s*-\s*(\d+)%\s+Off/gi,
      // Dollar amount off pattern  
      /([A-Za-z\s&]+)\s*-\s*\$(\d+)\s+Off/gi,
      // Alternative format: "Product Name $X Off"
      /([A-Za-z\s&]+)\s+\$(\d+)\s+Off/gi
    ];
    
    // Extract all discount entries
    const foundDiscounts = new Set<string>();
    
    discountPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const productName = match[1].trim();
        const discountAmount = match[2];
        const discountKey = `${productName}-${discountAmount}`;
        
        // Avoid duplicates
        if (foundDiscounts.has(discountKey)) continue;
        foundDiscounts.add(discountKey);
        
        // Determine discount type and format
        let discount: string;
        let definition: string = '';
        
        if (pattern.source.includes('%')) {
          discount = `${discountAmount}% Off`;
        } else {
          discount = `$${discountAmount} Off`;
        }
        
        // Try to find definition for this product
        // Look for "Definition:" or "Minor Code Tag" or "SKUs:" after the product
        const afterProduct = message.substring(match.index + match[0].length);
        const definitionMatch = afterProduct.match(/(?:Definition|Minor Code Tag|SKUs?):\s*([^\n]+)/i);
        if (definitionMatch) {
          definition = definitionMatch[1].trim();
        } else {
          // Default definition based on product type
          if (productName.toLowerCase().includes('mattress')) {
            definition = 'Mattress product';
          } else if (productName.toLowerCase().includes('merchandise')) {
            definition = 'All merchandise';
          } else {
            definition = productName;
          }
        }
        
        // Extract exclusions (look for common exclusion patterns)
        let exclusions = 'Already discounted, Red Tag, Special Orders, MAP, Fabric Protection, Warranties, Exclude From Sale tagged items';
        
        // Look for specific exclusions mentioned in the message
        const exclusionMatch = message.match(/(?:excludes?|exclusions?)[^.]*(?:merchandise|products?|items?)[^.]*\./gi);
        if (exclusionMatch) {
          const exclusionText = exclusionMatch[0].replace(/excludes?|exclusions?/gi, '').trim();
          if (exclusionText) {
            exclusions = exclusionText.replace(/\.$/, '');
          }
        }
        
        categories.push({
          category: productName,
          discount: discount,
          definition: definition,
          exclusions: exclusions
        });
      }
    });
    
    // If no specific products found, check for general merchandise discount
    if (categories.length === 0) {
      const generalMatch = message.match(/(\d+)%\s+Off\s+(?:all\s+)?(?:merchandise|products?)/i);
      if (generalMatch) {
        categories.push({
          category: 'All Merchandise',
          discount: `${generalMatch[1]}% Off`,
          definition: 'All merchandise',
          exclusions: 'Already discounted, Red Tag, Special Orders, MAP, Fabric Protection, Warranties, Exclude From Sale tagged items'
        });
      }
    }
    
    if (categories.length === 0) {
      return null;
    }
    
    console.log('categories=====:', title, date,categories);
    return {
      title: title,
      date: date,
      categories: categories
    };
  } catch (error) {
    console.error('Error extracting promotion data:', error);
    return null;
  }
};

// Function to create markdown table
export const createPromotionTable = (promotionData: PromotionData): string => {
  const title = promotionData.title;
  const date = promotionData.date;
  
  let table = `# ${title}${date ? ` – ${date}` : ''}\n\n`;
  table += `| Category | Discount | Definition | Exclusions |\n`;
  table += `|----------|----------|------------|------------|\n`;
  
  promotionData.categories.forEach(category => {
    table += `| ${category.category} | ${category.discount} | ${category.definition} | ${category.exclusions} |\n`;
  });
  
  return table;
};

// Function to create markdown table in code block format for Slack
export const createPromotionCodeBlock = (promotionData: PromotionData): string => {
  const title = promotionData.title;
  const date = promotionData.date;
  
  let table = `${title}${date ? ` – ${date}` : ''}\n\n`;
  table += `| Category | Discount | Definition | Exclusions |\n`;
  table += `|----------|----------|------------|------------|\n`;
  
  promotionData.categories.forEach(category => {
    table += `| ${category.category} | ${category.discount} | ${category.definition} | ${category.exclusions} |\n`;
  });
  
  // Wrap in code block
  return `\`\`\`\n${table}\n\`\`\``;
}; 