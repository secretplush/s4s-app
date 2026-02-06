/**
 * Plush AI Chatbot - Main Entry Point
 * 
 * An AI-powered chatbot for OnlyFans that handles:
 * - Welcome sequences for new subscribers
 * - PPV bundle creation and pricing
 * - Counter-offers and negotiation
 * - Follow-ups on unopened messages
 * - Urgency and scarcity tactics
 */

import { ChatbotConfig, ConversationContext, FanProfile, Message } from './types';
import { SalesEngine } from './sales-engine';
import { BundleBuilder } from './bundle-builder';
import { OnlyFansAPIClient } from './of-api-client';

export class PlushChatbot {
  private config: ChatbotConfig;
  private salesEngine: SalesEngine;
  private bundleBuilder: BundleBuilder;
  private ofApi: OnlyFansAPIClient;

  constructor(config: ChatbotConfig) {
    this.config = config;
    this.salesEngine = new SalesEngine(config.salesConfig);
    this.bundleBuilder = new BundleBuilder(config.contentLibrary);
    this.ofApi = new OnlyFansAPIClient(config.apiKey, config.accountId);
  }

  /**
   * Process an incoming message and generate a response
   */
  async processMessage(message: Message, context: ConversationContext): Promise<string> {
    const fanProfile = await this.getFanProfile(message.senderId);
    
    // Classify the message intent
    const intent = await this.classifyIntent(message.text, context);
    
    // Generate response based on intent
    switch (intent.type) {
      case 'greeting':
        return this.handleGreeting(fanProfile, context);
      
      case 'price_inquiry':
        return this.handlePriceInquiry(intent.contentType, fanProfile, context);
      
      case 'price_rejection':
        return this.handlePriceRejection(intent, fanProfile, context);
      
      case 'custom_request':
        return this.handleCustomRequest(intent.description, fanProfile, context);
      
      case 'compliment':
        return this.handleCompliment(fanProfile, context);
      
      case 'general_chat':
        return this.handleGeneralChat(message.text, fanProfile, context);
      
      default:
        return this.handleGeneralChat(message.text, fanProfile, context);
    }
  }

  /**
   * Handle new subscriber - send welcome sequence
   */
  async handleNewSubscriber(subscriberId: string): Promise<void> {
    const welcomeBundle = await this.bundleBuilder.createWelcomeBundle();
    
    // Send welcome message with PPV
    await this.ofApi.sendMessage(subscriberId, {
      text: this.config.scripts.welcome.greeting,
      media: welcomeBundle.media,
      price: welcomeBundle.price // $15-20 welcome PPV
    });
  }

  /**
   * Handle price rejection with counter-offer
   */
  private async handlePriceRejection(
    intent: any, 
    fan: FanProfile, 
    context: ConversationContext
  ): Promise<string> {
    const currentPrice = context.lastOfferedPrice;
    const rejectionCount = context.rejectionCount || 0;
    
    // NEVER say "no worries" - always counter-offer
    const counterOffer = this.salesEngine.getCounterOffer(
      currentPrice,
      rejectionCount,
      fan.spendingTier
    );
    
    if (counterOffer) {
      context.lastOfferedPrice = counterOffer.price;
      context.rejectionCount = rejectionCount + 1;
      
      return counterOffer.script;
    }
    
    // If we've hit floor price, use urgency tactic
    return this.salesEngine.getUrgencyScript(context.lastOfferedPrice);
  }

  /**
   * Classify message intent using AI
   */
  private async classifyIntent(text: string, context: ConversationContext): Promise<any> {
    // This would call an AI model to classify intent
    // For now, using pattern matching
    
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes('how much') || lowerText.includes('price')) {
      return { type: 'price_inquiry', contentType: this.extractContentType(text) };
    }
    
    if (lowerText.includes('too much') || lowerText.includes('expensive') || 
        lowerText.includes('no') || lowerText.includes("can't afford")) {
      return { type: 'price_rejection' };
    }
    
    if (lowerText.includes('hey') || lowerText.includes('hi') || lowerText.includes('hello')) {
      return { type: 'greeting' };
    }
    
    if (lowerText.includes('beautiful') || lowerText.includes('sexy') || 
        lowerText.includes('hot') || lowerText.includes('gorgeous')) {
      return { type: 'compliment' };
    }
    
    if (lowerText.includes('can you') || lowerText.includes('would you') || 
        lowerText.includes('custom')) {
      return { type: 'custom_request', description: text };
    }
    
    return { type: 'general_chat' };
  }

  // ... additional helper methods
  private async getFanProfile(fanId: string): Promise<FanProfile> {
    return this.ofApi.getFanProfile(fanId);
  }

  private extractContentType(text: string): string {
    // Extract what type of content they're asking about
    if (text.includes('pussy') || text.includes('nude')) return 'explicit';
    if (text.includes('video')) return 'video';
    if (text.includes('pic') || text.includes('photo')) return 'photo';
    return 'general';
  }

  private async handleGreeting(fan: FanProfile, context: ConversationContext): Promise<string> {
    return this.salesEngine.getGreetingResponse(fan);
  }

  private async handlePriceInquiry(contentType: string, fan: FanProfile, context: ConversationContext): Promise<string> {
    const pricing = this.salesEngine.getPricing(contentType, fan.spendingTier);
    context.lastOfferedPrice = pricing.initial;
    return pricing.script;
  }

  private async handleCustomRequest(description: string, fan: FanProfile, context: ConversationContext): Promise<string> {
    return this.salesEngine.getCustomRequestResponse(description, fan);
  }

  private async handleCompliment(fan: FanProfile, context: ConversationContext): Promise<string> {
    return this.salesEngine.getComplimentResponse(fan);
  }

  private async handleGeneralChat(text: string, fan: FanProfile, context: ConversationContext): Promise<string> {
    return this.salesEngine.getGeneralChatResponse(text, fan);
  }
}

export * from './types';
export * from './sales-engine';
export * from './bundle-builder';
