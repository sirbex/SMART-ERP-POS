/**
 * Standard API response format for all endpoints
 */
export interface ApiResponse<T = any> {
  /**
   * Indicates if the request was successful
   */
  success: boolean;
  
  /**
   * Optional message providing additional context about the response
   */
  message?: string;
  
  /**
   * Response data (only included for successful responses)
   */
  data?: T;
  
  /**
   * Array of error messages (only included for failed responses)
   */
  errors?: string[];
  
  /**
   * Additional metadata about the response (e.g. pagination info)
   */
  meta?: {
    /**
     * Pagination metadata
     */
    pagination?: {
      /**
       * Current page number
       */
      page: number;
      
      /**
       * Number of items per page
       */
      limit: number;
      
      /**
       * Total number of items across all pages
       */
      total: number;
      
      /**
       * Total number of pages
       */
      totalPages: number;
    };
    
    /**
     * Any additional metadata
     */
    [key: string]: any;
  };
}