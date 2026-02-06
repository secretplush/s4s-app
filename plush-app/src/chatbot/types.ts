/**
 * Type definitions for Plush AI Chatbot
 */

export interface ChatbotConfig {
  apiKey: string;
  accountId: string;
  modelName: string;  // The model's display name
  salesConfig: SalesConfig;
  contentLibrary: ContentLibrary;
  scripts: ScriptLibrary;
}

export interface SalesConfig {
  // Pricing tiers for different content types
  pricing: {
    photo: PricingTier;
    video: PricingTier;
    explicit: PricingTier;
    custom: PricingTier;
  };
  
  // Counter-offer percentages
  counterOfferLevels: number[];  // e.g., [0.7, 0.5, 0.4] = 70%, 50%, 40% of original
  
  // Urgency settings
  urgencyTimeMinutes: number;  // "Unlock in X minutes for bonus"
  
  // Follow-up settings
  followUpDelayHours: number;
}

export interface PricingTier {
  initial: number;      // Starting price
  floor: number;        // Minimum acceptable price
  whale: number;        // Premium price for high spenders
}

export interface ContentLibrary {
  photos: ContentItem[];
  videos: ContentItem[];
  bundles: Bundle[];
}

export interface ContentItem {
  id: string;
  type: 'photo' | 'video';
  category: string;  // 'tease', 'explicit', 'custom', etc.
  mediaUrl: string;
  previewUrl?: string;
}

export interface Bundle {
  id: string;
  name: string;
  description: string;
  items: ContentItem[];
  basePrice: number;
  discountedPrice: number;
}

export interface ScriptLibrary {
  welcome: {
    greeting: string;
    ppvIntro: string;
  };
  
  pricing: {
    photo: string;
    video: string;
    explicit: string;
    custom: string;
  };
  
  counterOffers: string[];
  
  urgency: string[];
  
  followUp: {
    unopened: string[];
    softGuild: string[];
  };
  
  complimentResponses: string[];
  
  greetings: string[];
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  timestamp: Date;
  hasMedia: boolean;
  mediaUrls?: string[];
}

export interface ConversationContext {
  fanId: string;
  lastOfferedPrice?: number;
  rejectionCount: number;
  lastContentType?: string;
  lastMessageTime: Date;
  conversationHistory: Message[];
  pendingPPVs: PendingPPV[];
}

export interface PendingPPV {
  id: string;
  price: number;
  sentAt: Date;
  opened: boolean;
  followUpSent: boolean;
}

export interface FanProfile {
  id: string;
  username: string;
  displayName: string;
  
  // Spending behavior
  spendingTier: 'whale' | 'buyer' | 'engaged' | 'silent';
  totalSpent: number;
  lastPurchaseDate?: Date;
  averagePurchase: number;
  
  // Engagement metrics
  subscriptionDate: Date;
  messageCount: number;
  likesCount: number;
  commentsCount: number;
  
  // Preferences (learned over time)
  preferredContentTypes: string[];
  priceRange: { min: number; max: number };
}

export interface CounterOffer {
  price: number;
  script: string;
  isFloor: boolean;
}

export interface PricingResponse {
  initial: number;
  script: string;
}

// Webhook events from OnlyFans API
export interface WebhookEvent {
  type: 'message.received' | 'subscription.new' | 'purchase.completed' | 'tip.received';
  data: any;
  timestamp: Date;
  accountId: string;
}
