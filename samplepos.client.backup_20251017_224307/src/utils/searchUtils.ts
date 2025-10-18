/**
 * Search utility functions for improved product search
 */

/**
 * Performs phonetic matching using a simplified version of the Soundex algorithm
 * to find items that sound similar to the search term
 */
export function soundsLike(text: string, search: string): boolean {
  if (!text || !search || search.length < 3) return false;
  
  // Convert to lowercase and remove non-alphanumeric characters
  const cleanText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanSearch = search.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Get first letter
  const firstLetter = cleanText.charAt(0);
  const searchFirstLetter = cleanSearch.charAt(0);
  
  // If first letters don't match, it's less likely to be a phonetic match
  if (firstLetter !== searchFirstLetter) return false;
  
  // Very simple phonetic comparison - check if the consonant pattern is similar
  // Extract consonants (except first letter)
  const textConsonants = cleanText.slice(1).replace(/[aeiou0-9]/g, '').slice(0, 5);
  const searchConsonants = cleanSearch.slice(1).replace(/[aeiou0-9]/g, '').slice(0, 5);
  
  // If one has no consonants, check if the other is similar
  if (!textConsonants || !searchConsonants) {
    return cleanText.includes(cleanSearch) || cleanSearch.includes(cleanText);
  }
  
  // Check if at least half of the consonants match
  let matches = 0;
  const minLength = Math.min(textConsonants.length, searchConsonants.length);
  
  for (let i = 0; i < minLength; i++) {
    if (textConsonants[i] === searchConsonants[i]) {
      matches++;
    }
  }
  
  return matches >= Math.ceil(minLength / 2);
}

/**
 * Checks if words in the search term appear in any order in the text
 * This helps with finding "Black Shirt" when searching for "Shirt Black"
 */
export function containsWordsInAnyOrder(text: string, search: string): boolean {
  if (!text || !search) return false;
  
  const textLower = text.toLowerCase();
  const searchTerms = search.toLowerCase().split(/\s+/).filter(term => term.length > 1);
  
  // If there's only one search term, use simple includes
  if (searchTerms.length <= 1) return false;
  
  // Check if all search terms are found in the text
  return searchTerms.every(term => textLower.includes(term));
}

/**
 * Checks for partial word matches
 * For example, finding "smartphone" when searching for "phone"
 */
export function hasPartialWordMatch(text: string, search: string): boolean {
  if (!text || !search || search.length < 3) return false;
  
  const textLower = text.toLowerCase();
  const searchLower = search.toLowerCase();
  
  // Split the text into words
  const words = textLower.split(/\s+/);
  
  // Check if any word contains the search term
  return words.some(word => {
    // Skip very short words
    if (word.length < 4) return false;
    
    // Check if the word contains the search term
    return word.includes(searchLower);
  });
}

/**
 * Calculates the relevance score of a search result
 * Higher score means more relevant match
 */
export function calculateRelevanceScore(item: any, searchTerm: string): number {
  const term = searchTerm.toLowerCase();
  let score = 0;
  
  // Check name field (highest weight)
  if (item.name) {
    const nameLower = item.name.toLowerCase();
    // Exact match gets highest score
    if (nameLower === term) {
      score += 100;
    }
    // Starts with search term
    else if (nameLower.startsWith(term)) {
      score += 80;
    }
    // Contains search term
    else if (nameLower.includes(term)) {
      score += 60;
    }
    // Words in any order
    else if (containsWordsInAnyOrder(nameLower, term)) {
      score += 50;
    }
    // Partial word match
    else if (hasPartialWordMatch(nameLower, term)) {
      score += 40;
    }
    // Sounds like
    else if (soundsLike(nameLower, term)) {
      score += 30;
    }
  }
  
  // Check identifier fields (medium weight)
  if (item.barcode && item.barcode.toLowerCase() === term) {
    score += 90; // Exact barcode match is very relevant
  }
  if (item.sku && item.sku.toLowerCase() === term) {
    score += 90; // Exact SKU match is very relevant
  }
  
  // Check additional fields (lower weight)
  if (item.category && item.category.toLowerCase().includes(term)) {
    score += 40;
  }
  if (item.notes && item.notes.toLowerCase().includes(term)) {
    score += 35;
  }
  
  // Stock availability provides a small boost
  if (typeof item.quantity === 'number' && item.quantity > 0) {
    score += 10;
  }
  
  return score;
}