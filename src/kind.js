/**
 * @fileoverview Kind system for hierarchical state machines
 * Compatible with Espruino JavaScript interpreter
 */

/**
 * @typedef {number} Kind
 */

const length = 32;  // Use 32-bit instead of 64-bit for JavaScript compatibility
const idLength = 8;
const depthMax = length / idLength;  // This gives us 4 levels instead of 8
const idMask = (1 << idLength) - 1;

/**
 * Get the base kinds from a kind ID
 * @param {number} id - The kind ID
 * @returns {number[]} Array of base kind IDs
 */
function bases(id) {
  var basesArray = [];
  for (var i = 0; i < depthMax; i++) {
    basesArray[i] = 0;
  }

  for (var i = 1; i < depthMax; i++) {
    basesArray[i - 1] = (id >> (idLength * i)) & idMask;
  }
  return basesArray;
}

/**
 * Safe left shift that works for shifts > 31 by using multiplication
 * @param {number} value - The value to shift
 * @param {number} shift - The number of bits to shift
 * @returns {number} The shifted value
 */
function safeLeftShift(value, shift) {
  if (shift >= 32) {
    // For shifts >= 32, use multiplication which works correctly
    return value * Math.pow(2, shift);
  } else {
    // For smaller shifts, use bitwise shift
    return value << shift;
  }
}

/**
 * Create a kind with the given ID and base kinds
 * @param {number} id - The primary ID
 * @param {...number} baseKinds - Base kinds to inherit from
 * @returns {number} The computed kind
 */
function kind(id) {
  var baseKinds = [];
  for (var i = 1; i < arguments.length; i++) {
    baseKinds.push(arguments[i]);
  }

  id = id & idMask;
  var ids = {};
  var idsCount = 0;

  for (var i = 0; i < baseKinds.length; i++) {
    var base = baseKinds[i];
    for (var j = 0; j < depthMax; j++) {
      var baseId = (base >> (idLength * j)) & idMask;
      if (baseId === 0) {
        break;
      }
      if (!ids[baseId]) {
        ids[baseId] = true;
        idsCount++;
        var shift = idLength * idsCount;
        var shifted = safeLeftShift(baseId, shift);

        // Use addition instead of OR for large numbers since JS OR is 32-bit limited
        if (shift >= 32) {
          id = id + shifted;
        } else {
          id |= shifted;
        }
      }
    }
  }
  return id;
}

/**
 * Check if a kind matches any of the given base kinds
 * @param {number} kindValue - The kind to check
 * @param {...number} baseKinds - Base kinds to check against
 * @returns {boolean} True if the kind matches any base
 */
export function isKind(kindValue) {
  var baseKinds = [];
  for (var i = 1; i < arguments.length; i++) {
    baseKinds.push(arguments[i]);
  }

  for (var i = 0; i < baseKinds.length; i++) {
    var base = baseKinds[i];
    var baseId = base & idMask;
    if (kindValue === baseId) {
      return true;
    }

    // Check segments, using division for large numbers instead of bitwise shift
    for (var j = 0; j < depthMax; j++) {
      var currentId;
      var shift = idLength * j;

      if (shift >= 32) {
        // For large shifts, use division
        currentId = Math.floor(kindValue / Math.pow(2, shift)) & idMask;
      } else {
        // For small shifts, use bitwise operations
        currentId = (kindValue >> shift) & idMask;
      }

      if (currentId === baseId) {
        return true;
      }
    }
  }
  return false;
}

// Export for module systems or global use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bases: bases, kind: kind, isKind: isKind };
} else if (typeof exports !== 'undefined') {
  exports.bases = bases;
  exports.kind = kind;
  exports.isKind = isKind;
} else {
  // Global export for Espruino
  global.KindSystem = { bases: bases, kind: kind, isKind: isKind };
} 