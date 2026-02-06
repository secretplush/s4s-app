/**
 * OnlyFans API Client
 * 
 * Integrates with OnlyFansAPI.com for:
 * - Sending messages and PPVs
 * - Getting fan profiles and spending data
 * - Receiving webhooks for incoming messages
 * - Managing content and media
 */

import { FanProfile, Message, ContentItem } from './types';

interface SendMessageOptions {
  text: string;
  media?: ContentItem[];
  price?: number;  // If set, creates a PPV message
}

interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class OnlyFansAPIClient {
  private apiKey: string;
  private accountId: string;
  private baseUrl = 'https://api.onlyfansapi.com/v1';

  constructor(apiKey: string, accountId: string) {
    this.apiKey = apiKey;
    this.accountId = accountId;
  }

  /**
   * Send a message (with optional PPV)
   */
  async sendMessage(userId: string, options: SendMessageOptions): Promise<APIResponse<any>> {
    const endpoint = `${this.baseUrl}/accounts/${this.accountId}/messages`;
    
    const body: any = {
      recipient_id: userId,
      text: options.text
    };

    // If media is included, attach it
    if (options.media && options.media.length > 0) {
      body.media = options.media.map(m => ({
        url: m.mediaUrl,
        type: m.type
      }));
    }

    // If price is set, make it a PPV
    if (options.price && options.price > 0) {
      body.price = options.price;
      body.is_ppv = true;
    }

    return this.request('POST', endpoint, body);
  }

  /**
   * Send a mass message to multiple users
   */
  async sendMassMessage(
    userIds: string[], 
    options: SendMessageOptions
  ): Promise<APIResponse<any>> {
    const endpoint = `${this.baseUrl}/accounts/${this.accountId}/messages/mass`;
    
    const body: any = {
      recipient_ids: userIds,
      text: options.text
    };

    if (options.media && options.media.length > 0) {
      body.media = options.media.map(m => ({
        url: m.mediaUrl,
        type: m.type
      }));
    }

    if (options.price && options.price > 0) {
      body.price = options.price;
      body.is_ppv = true;
    }

    return this.request('POST', endpoint, body);
  }

  /**
   * Get fan profile with spending data
   */
  async getFanProfile(userId: string): Promise<FanProfile> {
    const endpoint = `${this.baseUrl}/accounts/${this.accountId}/subscribers/${userId}`;
    
    const response = await this.request<any>('GET', endpoint);
    
    if (!response.success || !response.data) {
      // Return default profile if API fails
      return this.getDefaultProfile(userId);
    }

    return this.mapToFanProfile(response.data);
  }

  /**
   * Get list of subscribers
   */
  async getSubscribers(options?: {
    limit?: number;
    offset?: number;
    sortBy?: 'spent' | 'recent' | 'engagement';
  }): Promise<APIResponse<FanProfile[]>> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', options.limit.toString());
    if (options?.offset) params.set('offset', options.offset.toString());
    if (options?.sortBy) params.set('sort', options.sortBy);

    const endpoint = `${this.baseUrl}/accounts/${this.accountId}/subscribers?${params}`;
    
    const response = await this.request<any[]>('GET', endpoint);
    
    if (response.success && response.data) {
      return {
        success: true,
        data: response.data.map(d => this.mapToFanProfile(d))
      };
    }
    
    return response as APIResponse<FanProfile[]>;
  }

  /**
   * Get messages with a specific user
   */
  async getConversation(userId: string, limit = 50): Promise<APIResponse<Message[]>> {
    const endpoint = `${this.baseUrl}/accounts/${this.accountId}/messages/${userId}?limit=${limit}`;
    
    return this.request('GET', endpoint);
  }

  /**
   * Check if a PPV was opened/purchased
   */
  async checkPPVStatus(messageId: string): Promise<{ opened: boolean; purchased: boolean }> {
    const endpoint = `${this.baseUrl}/accounts/${this.accountId}/messages/${messageId}/status`;
    
    const response = await this.request<any>('GET', endpoint);
    
    return {
      opened: response.data?.opened ?? false,
      purchased: response.data?.purchased ?? false
    };
  }

  /**
   * Get fan spending statistics
   */
  async getFanStats(userId: string): Promise<{
    totalSpent: number;
    messageCount: number;
    lastPurchase?: Date;
    purchaseHistory: { amount: number; date: Date }[];
  }> {
    const endpoint = `${this.baseUrl}/accounts/${this.accountId}/subscribers/${userId}/stats`;
    
    const response = await this.request<any>('GET', endpoint);
    
    return {
      totalSpent: response.data?.total_spent ?? 0,
      messageCount: response.data?.message_count ?? 0,
      lastPurchase: response.data?.last_purchase ? new Date(response.data.last_purchase) : undefined,
      purchaseHistory: (response.data?.purchases ?? []).map((p: any) => ({
        amount: p.amount,
        date: new Date(p.date)
      }))
    };
  }

  /**
   * Setup webhook for incoming messages
   */
  async setupWebhook(webhookUrl: string, events: string[]): Promise<APIResponse<any>> {
    const endpoint = `${this.baseUrl}/accounts/${this.accountId}/webhooks`;
    
    return this.request('POST', endpoint, {
      url: webhookUrl,
      events: events
    });
  }

  // Private helper methods

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: any
  ): Promise<APIResponse<T>> {
    try {
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
      });

      const data = await response.json();
      
      if (!response.ok) {
        return {
          success: false,
          error: data.message || `HTTP ${response.status}`
        };
      }

      return {
        success: true,
        data: data
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private mapToFanProfile(data: any): FanProfile {
    const totalSpent = data.total_spent || 0;
    
    // Classify spending tier
    let spendingTier: FanProfile['spendingTier'];
    if (totalSpent > 500) {
      spendingTier = 'whale';
    } else if (totalSpent > 50) {
      spendingTier = 'buyer';
    } else if (data.likes_count > 5 || data.comments_count > 3) {
      spendingTier = 'engaged';
    } else {
      spendingTier = 'silent';
    }

    return {
      id: data.id,
      username: data.username,
      displayName: data.display_name || data.username,
      spendingTier,
      totalSpent,
      lastPurchaseDate: data.last_purchase ? new Date(data.last_purchase) : undefined,
      averagePurchase: data.average_purchase || 0,
      subscriptionDate: new Date(data.subscription_date || Date.now()),
      messageCount: data.message_count || 0,
      likesCount: data.likes_count || 0,
      commentsCount: data.comments_count || 0,
      preferredContentTypes: data.preferred_content || [],
      priceRange: {
        min: data.min_purchase || 0,
        max: data.max_purchase || 100
      }
    };
  }

  private getDefaultProfile(userId: string): FanProfile {
    return {
      id: userId,
      username: 'unknown',
      displayName: 'babe',
      spendingTier: 'silent',
      totalSpent: 0,
      averagePurchase: 0,
      subscriptionDate: new Date(),
      messageCount: 0,
      likesCount: 0,
      commentsCount: 0,
      preferredContentTypes: [],
      priceRange: { min: 0, max: 50 }
    };
  }
}
