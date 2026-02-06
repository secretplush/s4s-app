/**
 * Bundle Builder - Creates content bundles and PPV packages
 * 
 * Automatically assembles bundles based on:
 * - Fan preferences and spending history
 * - Content performance data
 * - Pricing optimization
 */

import { ContentLibrary, ContentItem, Bundle, FanProfile } from './types';

export interface BundleResult {
  media: ContentItem[];
  price: number;
  description: string;
  discountPercent?: number;
}

export class BundleBuilder {
  private library: ContentLibrary;

  constructor(library: ContentLibrary) {
    this.library = library;
  }

  /**
   * Create a welcome bundle for new subscribers ($15-20)
   */
  async createWelcomeBundle(): Promise<BundleResult> {
    // Select best performing "tease" content for welcome
    const teasePhotos = this.library.photos.filter(p => p.category === 'tease');
    const selectedPhotos = this.selectBestContent(teasePhotos, 3);
    
    return {
      media: selectedPhotos,
      price: 18, // Sweet spot for welcome PPV
      description: "Here's a little taste of what I can show you 🙈 Unlock to see what you've been missing...",
      discountPercent: 0
    };
  }

  /**
   * Create a personalized bundle based on fan profile
   */
  async createPersonalizedBundle(fan: FanProfile): Promise<BundleResult> {
    const preferredTypes = fan.preferredContentTypes;
    const priceRange = fan.priceRange;
    
    // Select content matching their preferences
    let selectedContent: ContentItem[] = [];
    
    for (const type of preferredTypes) {
      const matching = this.library.photos
        .concat(this.library.videos)
        .filter(item => item.category === type);
      
      selectedContent = selectedContent.concat(
        this.selectBestContent(matching, 2)
      );
    }
    
    // Calculate optimal price based on their history
    const basePrice = this.calculateBundlePrice(selectedContent);
    const adjustedPrice = this.adjustPriceForFan(basePrice, fan);
    
    return {
      media: selectedContent,
      price: adjustedPrice,
      description: this.generateBundleDescription(selectedContent, fan),
      discountPercent: fan.spendingTier === 'whale' ? 0 : 15
    };
  }

  /**
   * Create a "Deal of the Day" bundle with urgency
   */
  async createDealOfTheDay(): Promise<BundleResult> {
    // Mix of content types at a discount
    const photos = this.selectBestContent(this.library.photos, 5);
    const video = this.selectBestContent(this.library.videos, 1);
    
    const content = [...photos, ...video];
    const basePrice = this.calculateBundlePrice(content);
    const dealPrice = Math.round(basePrice * 0.6); // 40% off
    
    return {
      media: content,
      price: dealPrice,
      description: `🔥 TODAY ONLY: 5 pics + 1 video for just $${dealPrice}! (Normally $${basePrice}) Grab it before midnight! ⏰`,
      discountPercent: 40
    };
  }

  /**
   * Create a custom bundle based on request
   */
  async createCustomBundle(
    request: string, 
    fan: FanProfile
  ): Promise<BundleResult> {
    // Parse request to understand what they want
    const contentTypes = this.parseContentRequest(request);
    
    let selectedContent: ContentItem[] = [];
    
    for (const type of contentTypes) {
      const matching = this.library.photos
        .concat(this.library.videos)
        .filter(item => item.category.toLowerCase().includes(type));
      
      if (matching.length > 0) {
        selectedContent = selectedContent.concat(
          this.selectBestContent(matching, 2)
        );
      }
    }
    
    // Custom work gets premium pricing
    const basePrice = this.calculateBundlePrice(selectedContent);
    const customPrice = Math.round(basePrice * 1.3); // 30% premium for custom
    
    return {
      media: selectedContent,
      price: customPrice,
      description: `Made this bundle just for you babe 💕 Exactly what you asked for...`,
      discountPercent: 0
    };
  }

  /**
   * Create tiered bundles for upselling
   */
  createTieredOptions(contentType: string): BundleResult[] {
    const content = this.library.photos
      .concat(this.library.videos)
      .filter(item => item.category === contentType);
    
    return [
      // Basic tier
      {
        media: this.selectBestContent(content, 2),
        price: 15,
        description: '2 pics - perfect for a taste 😘'
      },
      // Standard tier
      {
        media: this.selectBestContent(content, 5),
        price: 32,
        description: '5 pics - my most popular bundle! 🔥'
      },
      // Premium tier
      {
        media: this.selectBestContent(content, 10),
        price: 50,
        description: '10 pics - the full experience 💕'
      },
      // VIP tier
      {
        media: [...this.selectBestContent(content, 15), ...this.selectBestContent(this.library.videos, 2)],
        price: 99,
        description: '15 pics + 2 videos - EVERYTHING 🔥🔥🔥'
      }
    ];
  }

  // Private helper methods

  private selectBestContent(items: ContentItem[], count: number): ContentItem[] {
    // In production, this would use engagement data to select best performing content
    // For now, random selection
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  private calculateBundlePrice(items: ContentItem[]): number {
    // Base pricing per item
    const photoPrice = 5;
    const videoPrice = 15;
    
    let total = 0;
    for (const item of items) {
      total += item.type === 'video' ? videoPrice : photoPrice;
    }
    
    // Bundle discount for multiple items
    if (items.length >= 5) {
      total = Math.round(total * 0.85); // 15% bundle discount
    }
    
    return total;
  }

  private adjustPriceForFan(basePrice: number, fan: FanProfile): number {
    switch (fan.spendingTier) {
      case 'whale':
        return Math.round(basePrice * 1.2); // Whales pay premium
      case 'buyer':
        return basePrice; // Standard pricing
      case 'engaged':
        return Math.round(basePrice * 0.8); // Discount to convert
      case 'silent':
        return Math.round(basePrice * 0.6); // Heavy discount to get first purchase
      default:
        return basePrice;
    }
  }

  private generateBundleDescription(content: ContentItem[], fan: FanProfile): string {
    const photoCount = content.filter(c => c.type === 'photo').length;
    const videoCount = content.filter(c => c.type === 'video').length;
    
    let desc = '';
    if (photoCount > 0 && videoCount > 0) {
      desc = `${photoCount} pics + ${videoCount} video${videoCount > 1 ? 's' : ''} 🔥`;
    } else if (photoCount > 0) {
      desc = `${photoCount} exclusive pics 💕`;
    } else {
      desc = `${videoCount} exclusive video${videoCount > 1 ? 's' : ''} 🔥`;
    }
    
    return `${desc} Put this together just for you ${fan.displayName}! 😘`;
  }

  private parseContentRequest(request: string): string[] {
    const lower = request.toLowerCase();
    const types: string[] = [];
    
    if (lower.includes('nude') || lower.includes('naked')) types.push('explicit');
    if (lower.includes('ass') || lower.includes('butt')) types.push('ass');
    if (lower.includes('boob') || lower.includes('tit')) types.push('boobs');
    if (lower.includes('pussy')) types.push('pussy');
    if (lower.includes('feet') || lower.includes('foot')) types.push('feet');
    if (lower.includes('video')) types.push('video');
    if (lower.includes('tease')) types.push('tease');
    
    return types.length > 0 ? types : ['general'];
  }
}
