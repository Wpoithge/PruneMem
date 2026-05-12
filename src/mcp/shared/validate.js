import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

const SUPPORTED_TYPES = ['string', 'object'];

function assertSupportedType(type, toolName, field) {
  if (!SUPPORTED_TYPES.includes(type)) {
    throw new Error(
      `unsupported schema type: ${type} (tool: ${toolName}, field: ${field})`
    );
  }
}

function checkType(value, expectedType, toolName, field) {
  if (expectedType === 'string' && typeof value !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Tool "${toolName}" field "${field}": expected string, got ${value === null ? 'null' : typeof value}`
    );
  }
  if (expectedType === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Tool "${toolName}" field "${field}": expected object, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`
      );
    }
  }
}

/**
 * Minimal JSON Schema validator for MCP tool arguments.
 *
 * Supports:
 *   - type: 'object' at the top level
 *   - properties with type: 'string' | 'object'
 *   - additionalProperties: false
 *   - required: string[]
 *
 * Throws McpError(ErrorCode.InvalidParams) on failure.
 * Returns undefined on success.
 *
 * @param {Record<string, unknown>} args
 * @param {object} inputSchema
 * @param {string} toolName
 */
export function validateArgs(args, inputSchema, toolName) {
  if (inputSchema.type !== 'object') {
    throw new Error(
      `unsupported schema type at root: ${inputSchema.type} (tool: ${toolName})`
    );
  }

  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Tool "${toolName}": arguments must be an object, got ${args === null ? 'null' : Array.isArray(args) ? 'array' : typeof args}`
    );
  }

  const declaredKeys = new Set(
    inputSchema.properties ? Object.keys(inputSchema.properties) : []
  );

  // Check for unexpected fields
  if (inputSchema.additionalProperties === false) {
    for (const key of Object.keys(args)) {
      if (!declaredKeys.has(key)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Tool "${toolName}": unexpected field "${key}"`
        );
      }
    }
  }

  // Check declared properties
  if (inputSchema.properties) {
    for (const [field, schema] of Object.entries(inputSchema.properties)) {
      if (schema.type === undefined) {
        throw new Error(
          `unsupported schema feature: missing type for property (tool: ${toolName}, field: ${field})`
        );
      }
      assertSupportedType(schema.type, toolName, field);

      if (field in args) {
        const value = args[field];
        if (value !== undefined) {
          checkType(value, schema.type, toolName, field);
        }
      }
    }
  }

  // Check required fields
  if (Array.isArray(inputSchema.required)) {
    for (const field of inputSchema.required) {
      if (!(field in args) || args[field] === undefined) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Tool "${toolName}": missing required field "${field}"`
        );
      }
    }
  }
}
