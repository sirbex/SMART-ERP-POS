/**
 * Error Utilities - Safe error message extraction from unknown catch values
 * 
 * Usage in catch blocks:
 *   catch (error: unknown) {
 *     const message = getErrorMessage(error);
 *   }
 */

/**
 * Safely extract an error message from an unknown caught value.
 * Use this in every catch block that changed from `catch (error: any)` to `catch (error: unknown)`.
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) return (error instanceof Error ? error.message : String(error));
    if (typeof error === 'string') return error;
    return String(error);
}

/**
 * Safely extract the full error (message + stack) for logging.
 */
export function getErrorDetail(error: unknown): { message: string; stack?: string } {
    if (error instanceof Error) {
        return { message: (error instanceof Error ? error.message : String(error)), stack: (error instanceof Error ? error.stack : undefined) };
    }
    return { message: String(error) };
}
