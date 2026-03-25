/**
 * @fileoverview Kind system for hierarchical state machines
 * Compatible with Espruino JavaScript interpreter
 */

/**
 * @typedef {number} Kind
 */

const length = 48;  // Use 48-bit packing to preserve deeper ancestry within JS number precision
const idLength = 8;
const depthMax = length / idLength;
const idMask = (1 << idLength) - 1;
var counter = 0;

function nextId() {
  var id = counter & idMask;
  counter++;
  return id;
}

function extractId(kindValue, depth) {
  return Math.floor(kindValue / Math.pow(2, idLength * depth)) & idMask;
}

/**
 * Get the base kinds from a kind ID
 * @param {number} id - The kind ID
 * @returns {number[]} Array of base kind IDs
 */
export function bases(id) {
  var basesArray = [];
  for (var i = 0; i < depthMax; i++) {
    basesArray[i] = 0;
  }

  for (var i = 1; i < depthMax; i++) {
    basesArray[i - 1] = extractId(id, i);
  }
  return basesArray;
}

/**
 * Create a kind with the built-in counter, like hsm.go.
 * @param {...number} baseKinds - Base kinds to inherit from
 * @returns {number} The computed kind
 */
export function kind() {
  var result = nextId();
  var ids = {};
  var idsCount = 0;

  for (var i = 0; i < arguments.length; i++) {
    var base = arguments[i];
    for (var j = 0; j < depthMax; j++) {
      var baseId = extractId(base, j);
      if (baseId === 0) {
        break;
      }
      if (!ids[baseId]) {
        ids[baseId] = true;
        idsCount++;
        result += baseId * Math.pow(2, idLength * idsCount);
      }
    }
  }
  return result;
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

    for (var j = 0; j < depthMax; j++) {
      var currentId = extractId(kindValue, j);
      if (currentId === baseId) {
        return true;
      }
    }
  }
  return false;
}

export const MakeKind = kind;
export const IsKind = isKind;

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
