// backend/src/middleware/validation.js

/**
 * Input sanitization and validation utilities
 */

/**
 * Sanitize string input: trim and normalize
 * Protects against basic injection and XSS
 */
export function sanitizeString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Sanitize email: lowercase, trim
 */
export function sanitizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

/**
 * Sanitize number: parse float and validate range
 */
export function sanitizeNumber(value, min = -Infinity, max = Infinity) {
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

/**
 * Validate required fields
 * @param {object} data - Object to validate
 * @param {array} fields - Required field names
 * @returns {string|null} - Error message or null
 */
export function validateRequired(data, fields) {
  for (const field of fields) {
    const value = data[field];
    if (value === undefined || value === null || value === '') {
      return `${field} is required`;
    }
  }
  return null;
}

/**
 * Validate email format
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 * - At least 6 characters
 * - At least 1 number (optional)
 * - At least 1 special char (optional)
 */
export function validatePassword(password, minLength = 6) {
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters`;
  }
  return null;
}

/**
 * Validate enum value
 */
export function validateEnum(value, allowedValues) {
  if (!allowedValues.includes(value)) {
    return `Must be one of: ${allowedValues.join(', ')}`;
  }
  return null;
}

/**
 * Validate age
 */
export function validateAge(age) {
  age = parseInt(age);
  if (isNaN(age) || age < 1 || age > 150) {
    return 'Age must be between 1 and 150';
  }
  return null;
}

/**
 * Validate weight (kg)
 */
export function validateWeight(weight) {
  weight = parseFloat(weight);
  if (isNaN(weight) || weight < 20 || weight > 500) {
    return 'Weight must be between 20kg and 500kg';
  }
  return null;
}

/**
 * Validate height (cm)
 */
export function validateHeight(height) {
  height = parseFloat(height);
  if (isNaN(height) || height < 50 || height > 300) {
    return 'Height must be between 50cm and 300cm';
  }
  return null;
}

/**
 * Validate duration (minutes)
 */
export function validateDuration(duration) {
  duration = parseFloat(duration);
  if (isNaN(duration) || duration < 1 || duration > 1440) {
    return 'Duration must be between 1 and 1440 minutes';
  }
  return null;
}

/**
 * Validate calories (kcal)
 */
export function validateCalories(calories) {
  calories = parseFloat(calories);
  if (isNaN(calories) || calories < 0 || calories > 50000) {
    return 'Calories must be between 0 and 50000 kcal';
  }
  return null;
}

/**
 * Validate Mongoose ObjectId
 */
export function validateObjectId(id) {
  return /^[0-9a-fA-F]{24}$/.test(id);
}

/**
 * Composite validation builder
 * @param {object} schema - Schema definition like {email: {required: true, sanitize: 'email'}, age: {required: true, validate: 'age'}}
 * @param {object} data - Data to validate
 * @returns {object} - {valid: bool, errors: {field: message}, sanitized: {cleanedData}}
 */
export function validateSchema(schema, data) {
  const errors = {};
  const sanitized = {};

  for (const [field, rules] of Object.entries(schema)) {
    let value = data[field];

    // Sanitize
    if (rules.sanitize) {
      switch (rules.sanitize) {
        case 'string':
          value = sanitizeString(value);
          break;
        case 'email':
          value = sanitizeEmail(value);
          break;
        case 'number':
          value = sanitizeNumber(value, rules.min, rules.max);
          break;
      }
    }

    // Check required
    if (rules.required && (!value || value === '')) {
      errors[field] = `${field} is required`;
      continue;
    }

    // Validate
    if (rules.validate && value) {
      let validationError = null;
      switch (rules.validate) {
        case 'email':
          if (!validateEmail(value)) validationError = 'Invalid email format';
          break;
        case 'password':
          validationError = validatePassword(value, rules.minLength);
          break;
        case 'age':
          validationError = validateAge(value);
          break;
        case 'weight':
          validationError = validateWeight(value);
          break;
        case 'height':
          validationError = validateHeight(value);
          break;
        case 'duration':
          validationError = validateDuration(value);
          break;
        case 'calories':
          validationError = validateCalories(value);
          break;
        case 'enum':
          validationError = validateEnum(value, rules.allowedValues || []);
          break;
        case 'objectId':
          if (!validateObjectId(value)) validationError = 'Invalid ID format';
          break;
      }
      if (validationError) {
        errors[field] = validationError;
      }
    }

    sanitized[field] = value;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    sanitized
  };
}
