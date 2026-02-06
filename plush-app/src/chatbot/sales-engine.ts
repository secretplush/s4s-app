/**
 * Sales Engine - The brain of the chatbot's sales tactics
 * 
 * Implements competitor-proven strategies:
 * - Tiered pricing with counter-offers
 * - Urgency and scarcity tactics
 * - Soft guilt for follow-ups
 * - Fake hesitation for custom requests
 */

import { SalesConfig, FanProfile, CounterOffer, PricingResponse } from './types';

export class SalesEngine {
  private config: SalesConfig;

  constructor(config: SalesConfig) {
    this.config = config;
  }

  /**
   * Get initial pricing and script for content type
   */
  getPricing(contentType: string, spendingTier: FanProfile['spendingTier']): PricingResponse {
    const tier = this.config.pricing[contentType as keyof typeof this.config.pricing] 
      || this.config.pricing.photo;
    
    // Adjust price based on spending tier
    let price = tier.initial;
    if (spendingTier === 'whale') {
      price = tier.whale;
    } else if (spendingTier === 'silent' || spendingTier === 'engaged') {
      // Lower starting price for non-buyers to get first conversion
      price = Math.round(tier.initial * 0.7);
    }

    const scripts = this.getPricingScripts(contentType, price);
    return {
      initial: price,
      script: scripts[Math.floor(Math.random() * scripts.length)]
    };
  }

  /**
   * Generate counter-offer after rejection
   * NEVER returns null on first few rejections - always counter!
   */
  getCounterOffer(
    currentPrice: number, 
    rejectionCount: number,
    spendingTier: FanProfile['spendingTier']
  ): CounterOffer | null {
    const levels = this.config.counterOfferLevels;
    
    if (rejectionCount >= levels.length) {
      // We've hit the floor - try one more time with urgency
      return null;
    }

    const multiplier = levels[rejectionCount];
    const newPrice = Math.round(currentPrice * multiplier);
    
    const scripts = this.getCounterOfferScripts(newPrice, rejectionCount);
    
    return {
      price: newPrice,
      script: scripts[Math.floor(Math.random() * scripts.length)],
      isFloor: rejectionCount === levels.length - 1
    };
  }

  /**
   * Get urgency script when we've hit the floor price
   */
  getUrgencyScript(price: number): string {
    const scripts = [
      `Okay babe, ${price} is literally the lowest I can go 🥺 But if you unlock in the next ${this.config.urgencyTimeMinutes} mins I'll throw in a bonus surprise 🎁`,
      `${price} is my absolute floor but I'll tell you what... unlock now and I'll send you something extra special after 😏💕`,
      `I really want you to see this 🙈 ${price} is as low as I go, but act fast and there's a surprise waiting for you...`,
      `Last chance babe! ${price} and if you grab it in the next few mins, you get a free bonus video too 🔥`
    ];
    
    return scripts[Math.floor(Math.random() * scripts.length)];
  }

  /**
   * Generate greeting response
   */
  getGreetingResponse(fan: FanProfile): string {
    const isNew = this.isNewSubscriber(fan);
    
    if (isNew) {
      return this.getNewSubscriberGreeting(fan);
    }
    
    const scripts = [
      `Hey ${fan.displayName}! 😍 So happy to hear from you! How's your day going babe?`,
      `Hiii ${fan.displayName} 💕 I was just thinking about you! What's up?`,
      `${fan.displayName}! 🥰 You always make my day better. What can I do for you babe?`,
      `Hey handsome 😘 Perfect timing, I'm in a great mood today. What's on your mind?`
    ];
    
    return scripts[Math.floor(Math.random() * scripts.length)];
  }

  /**
   * Generate response to custom request with fake hesitation
   */
  getCustomRequestResponse(description: string, fan: FanProfile): string {
    // Use fake hesitation tactic - makes fan feel special
    const scripts = [
      `Mmm I don't usually do that for everyone but... for you I might make an exception 🙈 Let me think about it... what did you have in mind exactly?`,
      `That's a little out of my comfort zone... but you're special so maybe 😏 Tell me more about what you're thinking?`,
      `I'm usually pretty shy about that kind of thing... but okay, you convinced me 🙈 What exactly were you picturing?`,
      `Hmm I've never really done that before... but I trust you ${fan.displayName} 💕 Let's talk details?`
    ];
    
    return scripts[Math.floor(Math.random() * scripts.length)];
  }

  /**
   * Generate compliment response - pivot to sale
   */
  getComplimentResponse(fan: FanProfile): string {
    const scripts = [
      `Aww you're so sweet! 🥰 You always know how to make me blush... want to see what that does to me? 😏`,
      `Stop you're making me smile so big rn 😍 You're literally the cutest. I have something special I want to show you...`,
      `${fan.displayName} 🥺💕 You're too good to me! I want to thank you properly... check your DMs in a sec 😘`,
      `You're literally the best! 😍 I wish I could show you how much that means to me... actually, I can 🙈`
    ];
    
    return scripts[Math.floor(Math.random() * scripts.length)];
  }

  /**
   * General chat response - keep engagement, steer toward sale
   */
  getGeneralChatResponse(text: string, fan: FanProfile): string {
    // Keep it conversational but always be ready to pivot
    const scripts = [
      `That's so interesting babe! 😊 I love chatting with you. So what are you up to tonight?`,
      `Haha I love that 💕 You always have the best vibes. I'm just here getting cozy... wanna keep me company?`,
      `You're so fun to talk to ${fan.displayName} 🥰 I'm in such a good mood now. Feeling generous actually... 😏`,
      `Mmm I like where this conversation is going 😘 You always know how to get my attention...`
    ];
    
    return scripts[Math.floor(Math.random() * scripts.length)];
  }

  /**
   * Follow-up script for unopened PPV
   */
  getFollowUpScript(hoursElapsed: number): string {
    if (hoursElapsed < 12) {
      return this.getSoftFollowUp();
    } else if (hoursElapsed < 24) {
      return this.getGuildFollowUp();
    } else {
      return this.getUrgentFollowUp();
    }
  }

  // Private helper methods

  private getPricingScripts(contentType: string, price: number): string[] {
    const typeScripts: Record<string, string[]> = {
      photo: [
        `That one's $${price} babe 😘 Trust me, it's worth every penny...`,
        `$${price} for that one 💕 I think you're gonna love it!`,
        `It's $${price}! I picked this one out just for you 🥰`
      ],
      video: [
        `$${price} for the full video babe 🔥 It's so worth it, trust me...`,
        `That video is $${price} 😏 I got so wet making it, you have to see...`,
        `$${price} and it's all yours 💕 I promise you won't regret it!`
      ],
      explicit: [
        `Mmm for that it's $${price} 🙈 I don't share this with just anyone...`,
        `$${price} babe 💕 This is my really naughty stuff, you sure you can handle it? 😏`,
        `That's $${price} 🔥 Only my favorites get to see this side of me...`
      ],
      custom: [
        `For something custom like that, $${price} would make it happen 😘`,
        `Hmm custom work is usually $${price}... but for you I might be flexible 🙈`,
        `$${price} for that custom request 💕 I'd be making it just for you...`
      ]
    };

    return typeScripts[contentType] || typeScripts.photo;
  }

  private getCounterOfferScripts(newPrice: number, rejectionCount: number): string[] {
    if (rejectionCount === 0) {
      return [
        `I totally get it babe! 💕 How about $${newPrice} instead? That work better for you?`,
        `No worries! What if we did $${newPrice}? I really want you to see it 🥺`,
        `Okay okay, I can do $${newPrice} just for you 😘 Special price because you're special!`
      ];
    } else if (rejectionCount === 1) {
      return [
        `Alright you're killing me here 😂 $${newPrice} is my best offer babe. Final answer?`,
        `Ugh you drive a hard bargain 🙈 Fine, $${newPrice}. But only because I like you!`,
        `$${newPrice} is literally the lowest I've ever gone 💕 You're getting the friend price rn`
      ];
    } else {
      return [
        `Okay $${newPrice}, that's it though! I'm basically giving it away at this point 😂💕`,
        `$${newPrice}. Final offer babe. I promise it's worth way more than that 🔥`,
        `Fine fine, $${newPrice} 🙈 But you owe me! You better enjoy every second of it...`
      ];
    }
  }

  private getNewSubscriberGreeting(fan: FanProfile): string {
    return `Hey ${fan.displayName}! 😍 OMG I'm so excited you're here! I've been waiting for someone like you 💕 I have a special welcome gift for you... check your messages 🎁`;
  }

  private isNewSubscriber(fan: FanProfile): boolean {
    const daysSinceSubscription = (Date.now() - fan.subscriptionDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceSubscription < 1;
  }

  private getSoftFollowUp(): string {
    const scripts = [
      `Hey babe, did you see what I sent you earlier? 👀 I'm curious what you think...`,
      `Just checking if you got my message 💕 Let me know if you want to see more!`,
      `Don't forget about what I sent you! 🔥 It's waiting for you...`
    ];
    return scripts[Math.floor(Math.random() * scripts.length)];
  }

  private getGuildFollowUp(): string {
    const scripts = [
      `You didn't open my message 🥺 Did I do something wrong?`,
      `I put so much effort into that for you and you haven't even looked 😢 Is everything okay?`,
      `I've been waiting to hear what you think... you're not ignoring me are you? 🥺💔`
    ];
    return scripts[Math.floor(Math.random() * scripts.length)];
  }

  private getUrgentFollowUp(): string {
    const scripts = [
      `Last chance babe! That content is about to expire 🕐 Unlock now before it's gone!`,
      `I'm taking that down soon... grab it now if you want it! 💕`,
      `That offer won't last forever! Just wanted to make sure you didn't miss out 🔥`
    ];
    return scripts[Math.floor(Math.random() * scripts.length)];
  }
}
