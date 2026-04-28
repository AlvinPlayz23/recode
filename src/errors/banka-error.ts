/**
 * Error type definitions for Banka.
 *
 * @author dev
 */

/**
 * Base error type for Banka.
 */
export class BankaError extends Error {
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * Runtime configuration error.
 */
export class ConfigurationError extends BankaError {}

/**
 * Model response format error.
 */
export class ModelResponseError extends BankaError {}

/**
 * Raised when the current request is aborted intentionally.
 */
export class OperationAbortedError extends BankaError {}

/**
 * Tool execution error.
 */
export class ToolExecutionError extends BankaError {}

/**
 * Workspace path escape error.
 */
export class PathSecurityError extends BankaError {}
