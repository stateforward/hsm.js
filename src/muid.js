/**
 * @fileoverview Monotonically Unique ID (MUID) generator for Espruino
 * Port of the Go muid package implementing 64-bit unique IDs using two 32-bit numbers.
 * 
 * Default layout: [41 bits timestamp] [14 bits machine ID] [9 bits counter]
 * The bit allocation and epoch can be customized via the Config object.
 */

// Crypto API for random values (browser/Node.js compatible)
var crypto;
if (typeof window !== 'undefined' && window.crypto) {
  crypto = window.crypto;
} else if (typeof require !== 'undefined') {
  try {
    crypto = require('crypto');
  } catch (e) {
    // Fall back to global or no crypto
    crypto = null;
  }
}

/**
 * 64-bit arithmetic using two 32-bit numbers
 */

/**
 * Create a 64-bit value from high and low 32-bit parts
 * @param {number} high - High 32 bits
 * @param {number} low - Low 32 bits
 * @returns {Object} 64-bit value {high, low}
 */
function make64(high, low) {
  return {
    high: (high >>> 0), // Ensure unsigned 32-bit
    low: (low >>> 0)
  };
}

/**
 * Convert a regular number to 64-bit representation
 * @param {number} value - Number to convert
 * @returns {Object} 64-bit value {high, low}
 */
function from32(value) {
  return make64(0, value >>> 0);
}

/**
 * Add two 64-bit numbers
 * @param {Object} a - First 64-bit number
 * @param {Object} b - Second 64-bit number
 * @returns {Object} Sum as 64-bit number
 */
function add64(a, b) {
  var low = (a.low + b.low) >>> 0;
  var carry = (a.low + b.low) > 0xFFFFFFFF ? 1 : 0;
  var high = (a.high + b.high + carry) >>> 0;
  return make64(high, low);
}

/**
 * Subtract two 64-bit numbers
 * @param {Object} a - First 64-bit number
 * @param {Object} b - Second 64-bit number  
 * @returns {Object} Difference as 64-bit number
 */
function sub64(a, b) {
  var low = (a.low - b.low) >>> 0;
  var borrow = a.low < b.low ? 1 : 0;
  var high = (a.high - b.high - borrow) >>> 0;
  return make64(high, low);
}

/**
 * Left shift 64-bit number
 * @param {Object} value - 64-bit number to shift
 * @param {number} bits - Number of bits to shift (0-63)
 * @returns {Object} Shifted 64-bit number
 */
function shl64(value, bits) {
  if (bits === 0) return value;
  if (bits >= 64) return make64(0, 0);

  if (bits >= 32) {
    return make64(value.low << (bits - 32), 0);
  } else {
    var high = (value.high << bits) | (value.low >>> (32 - bits));
    var low = value.low << bits;
    return make64(high >>> 0, low >>> 0);
  }
}

/**
 * Right shift 64-bit number
 * @param {Object} value - 64-bit number to shift
 * @param {number} bits - Number of bits to shift (0-63)
 * @returns {Object} Shifted 64-bit number
 */
function shr64(value, bits) {
  if (bits === 0) return value;
  if (bits >= 64) return make64(0, 0);

  if (bits >= 32) {
    return make64(0, value.high >>> (bits - 32));
  } else {
    var low = (value.low >>> bits) | (value.high << (32 - bits));
    var high = value.high >>> bits;
    return make64(high >>> 0, low >>> 0);
  }
}

/**
 * Bitwise OR of two 64-bit numbers
 * @param {Object} a - First 64-bit number
 * @param {Object} b - Second 64-bit number
 * @returns {Object} OR result as 64-bit number
 */
function or64(a, b) {
  return make64((a.high | b.high) >>> 0, (a.low | b.low) >>> 0);
}

/**
 * Bitwise AND of two 64-bit numbers
 * @param {Object} a - First 64-bit number
 * @param {Object} b - Second 64-bit number
 * @returns {Object} AND result as 64-bit number
 */
function and64(a, b) {
  return make64((a.high & b.high) >>> 0, (a.low & b.low) >>> 0);
}

/**
 * Compare two 64-bit numbers
 * @param {Object} a - First 64-bit number
 * @param {Object} b - Second 64-bit number
 * @returns {number} -1 if a < b, 0 if a === b, 1 if a > b
 */
function cmp64(a, b) {
  if (a.high < b.high) return -1;
  if (a.high > b.high) return 1;
  if (a.low < b.low) return -1;
  if (a.low > b.low) return 1;
  return 0;
}

/**
 * Check if 64-bit number is greater than or equal to another
 * @param {Object} a - First 64-bit number
 * @param {Object} b - Second 64-bit number
 * @returns {boolean} True if a >= b
 */
function gte64(a, b) {
  return cmp64(a, b) >= 0;
}

/**
 * Convert 64-bit number to decimal string
 * @param {Object} value - 64-bit number
 * @returns {string} Decimal string representation
 */
function toString64(value) {
  if (value.high === 0) {
    return value.low.toString();
  }

  // For large numbers, we need to do long division
  var result = '';
  var remainder = make64(value.high, value.low);
  var zero = make64(0, 0);

  while (cmp64(remainder, zero) > 0) {
    var digit = 0;
    var temp = make64(remainder.high, remainder.low);

    // Find the largest digit such that digit * 10 <= remainder
    for (var i = 9; i >= 0; i--) {
      var test = from32(i);
      if (gte64(temp, test)) {
        digit = i;
        remainder = sub64(remainder, test);
        break;
      }
    }
    result = digit.toString() + result;

    // This is a simplified approach - for full accuracy we'd need proper division
    // For MUID purposes, we'll use a different approach for string conversion
    break;
  }

  // Fallback: convert using JavaScript's number precision where possible
  if (value.high === 0) {
    return value.low.toString();
  } else if (value.high < 0x200000) { // Safe range for JavaScript numbers
    var num = value.high * 0x100000000 + value.low;
    return num.toString();
  } else {
    // For very large numbers, return hex with prefix
    return '0x' + toHex64(value);
  }
}

/**
 * Convert 64-bit number to hexadecimal string
 * @param {Object} value - 64-bit number
 * @returns {string} Hexadecimal string
 */
function toHex64(value) {
  if (value.high === 0) {
    return value.low.toString(16);
  }
  var highHex = value.high.toString(16);
  var lowHex = value.low.toString(16);
  // Pad low part to 8 characters
  while (lowHex.length < 8) {
    lowHex = '0' + lowHex;
  }
  return highHex + lowHex;
}

/**
 * Convert 64-bit number to base32 string
 * @param {Object} value - 64-bit number
 * @returns {string} Base32 string
 */
function toBase32_64(value) {
  if (value.high === 0) {
    return value.low.toString(32);
  }
  // For simplicity, convert through hex for large numbers
  // In a full implementation, we'd do proper base32 conversion
  var hex = toHex64(value);
  var num = 0;
  var result = '';

  // Convert hex to base32 (simplified approach)
  for (var i = 0; i < hex.length; i++) {
    num = num * 16 + parseInt(hex[i], 16);
    if (num >= 32) {
      result += (num % 32).toString(32);
      num = Math.floor(num / 32);
    }
  }
  if (num > 0) {
    result = num.toString(32) + result;
  }
  return result || '0';
}

/**
 * Simple hash function for strings (FNV-1a variant)
 * @param {string} str - String to hash
 * @returns {Object} Hash value as 64-bit number
 */
function hashString(str) {
  var hash = make64(0x811c9dc5, 0); // FNV offset basis (32-bit)
  var prime = from32(0x01000193); // FNV prime (32-bit)

  for (var i = 0; i < str.length; i++) {
    var char = from32(str.charCodeAt(i));
    hash = and64(or64(hash, char), make64(0, 0xFFFFFFFF)); // XOR and keep 32-bit
    // Simplified multiplication (hash * prime) for 32-bit range
    if (hash.high === 0) {
      hash = from32((hash.low * prime.low) >>> 0);
    }
  }

  return hash;
}

/**
 * Get hostname (Node.js) or generate a stable identifier (browser)
 * @returns {string} Machine identifier
 */
function getMachineIdentifier() {
  if (typeof require !== 'undefined') {
    try {
      var os = require('os');
      return os.hostname();
    } catch (e) {
      // Fall through to browser method
    }
  }

  // Browser fallback: use navigator properties or generate random
  if (typeof navigator !== 'undefined') {
    return navigator.userAgent + navigator.platform + (navigator.hardwareConcurrency || '');
  }

  // Final fallback: random string
  return 'js-' + Math.random().toString(36).substring(2);
}

/**
 * Generate random bytes
 * @param {number} length - Number of bytes
 * @returns {Array} Random bytes as array
 */
function getRandomBytes(length) {
  var array = [];

  if (crypto && crypto.getRandomValues) {
    var uintArray = new Uint8Array(length);
    crypto.getRandomValues(uintArray);
    for (var i = 0; i < length; i++) {
      array[i] = uintArray[i];
    }
  } else if (crypto && crypto.randomBytes) {
    // Node.js crypto
    var buffer = crypto.randomBytes(length);
    for (var i = 0; i < length; i++) {
      array[i] = buffer[i];
    }
  } else {
    // Fallback to Math.random (not cryptographically secure)
    for (var i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }

  return array;
}

/**
 * Configuration for MUID generator
 * @typedef {Object} Config
 * @property {Object} machineID - Machine identifier as 64-bit {high, low}
 * @property {number} timestampBitLen - Number of bits for timestamp (default: 41)
 * @property {number} machineIDBitLen - Number of bits for machine ID (default: 14)
 * @property {Object} epoch - Epoch start time as 64-bit {high, low} (default: 1700000000000)
 */

/**
 * Default configuration
 * @returns {Config} Default config
 */
function getDefaultConfig() {
  var config = {
    timestampBitLen: 41,
    machineIDBitLen: 14,
    epoch: from32(1700000000000 & 0xFFFFFFFF) // November 14, 2023 22:13:20 GMT (lower 32 bits)
  };

  // For the epoch, we need to handle the full 64-bit value
  // 1700000000000 = 0x18C2F25000 (needs high bits)
  config.epoch = make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF);

  // Calculate machine ID mask - 2^14 - 1 = 16383
  var maxMachineID = (1 << config.machineIDBitLen) - 1;

  var identifier = getMachineIdentifier();
  var machineID;

  if (identifier) {
    // Hash the identifier and mask to fit
    var hash = hashString(identifier);
    machineID = from32(hash.low & maxMachineID);
  } else {
    // Random fallback
    var randomBytes = getRandomBytes(4);
    var randomValue = 0;
    for (var i = 0; i < 4; i++) {
      randomValue = (randomValue << 8) | randomBytes[i];
    }
    machineID = from32(randomValue & maxMachineID);
  }

  config.machineID = machineID;
  return config;
}

/**
 * MUID class representing a Monotonically Unique ID
 * @constructor
 * @param {Object|number} value - The 64-bit MUID value as {high, low} or number
 */
function MUID(value) {
  if (typeof value === 'number') {
    this.value = from32(value);
  } else if (value && typeof value.high === 'number' && typeof value.low === 'number') {
    this.value = make64(value.high, value.low);
  } else {
    this.value = make64(0, 0);
  }
}

/**
 * Convert MUID to base32 string representation
 * @returns {string} Base32 encoded string
 */
MUID.prototype.toString = function () {
  return toBase32_64(this.value);
};

/**
 * Convert MUID to hex string
 * @returns {string} Hexadecimal string
 */
MUID.prototype.toHex = function () {
  return toHex64(this.value);
};

/**
 * Convert MUID to decimal string
 * @returns {string} Decimal string
 */
MUID.prototype.toDecimal = function () {
  return toString64(this.value);
};

/**
 * Get the raw 64-bit value
 * @returns {Object} The raw 64-bit value as {high, low}
 */
MUID.prototype.valueOf = function () {
  return this.value;
};

/**
 * Generator class for creating MUIDs
 * @constructor
 * @param {Config} config - Configuration object
 * @param {number} shardIndex - Shard index for this generator
 * @param {number} shardBitLen - Number of bits used for sharding
 */
function Generator(config, shardIndex, shardBitLen) {
  // Apply defaults
  this.timestampBitLen = config.timestampBitLen || 41;
  this.machineIDBitLen = config.machineIDBitLen || 14;
  this.epoch = config.epoch || make64(Math.floor(1700000000000 / 0x100000000), 1700000000000 & 0xFFFFFFFF);
  this.shardIndex = shardIndex || 0;
  this.shardBitLen = shardBitLen || 0;

  // Calculate bit lengths and shifts
  this.counterBitLen = 64 - this.timestampBitLen - this.machineIDBitLen - this.shardBitLen;

  this.timestampBitShift = this.machineIDBitLen + this.shardBitLen + this.counterBitLen;
  this.machineIDShift = this.shardBitLen + this.counterBitLen;
  this.shardIndexShift = this.counterBitLen;

  // Create counter mask: 2^counterBitLen - 1
  var counterMask = this.counterBitLen >= 32 ?
    make64(0xFFFFFFFF, 0xFFFFFFFF) :
    sub64(shl64(from32(1), this.counterBitLen), from32(1));
  this.counterBitMask = counterMask;

  // Set machine ID and mask it
  this.machineID = config.machineID || from32(0);
  var machineIDMask = this.machineIDBitLen >= 32 ?
    make64(0xFFFFFFFF, 0xFFFFFFFF) :
    sub64(shl64(from32(1), this.machineIDBitLen), from32(1));
  this.machineID = and64(this.machineID, machineIDMask);

  // Mask shard index
  var shardMask = this.shardBitLen >= 32 ?
    make64(0xFFFFFFFF, 0xFFFFFFFF) :
    sub64(shl64(from32(1), this.shardBitLen), from32(1));
  this.shardIndex = (this.shardIndex & ((1 << Math.min(this.shardBitLen, 31)) - 1)) >>> 0;

  // State packs timestamp and counter: [timestamp][counter]
  this.state = from32(1);
}

/**
 * Generate a new MUID
 * @returns {MUID} New unique ID
 */
Generator.prototype.id = function () {
  var now = sub64(from32(Date.now() & 0xFFFFFFFF), this.epoch);

  // Handle the high bits of Date.now() for very large timestamps
  var dateNow = Date.now();
  if (dateNow > 0xFFFFFFFF) {
    now = sub64(make64(Math.floor(dateNow / 0x100000000), dateNow & 0xFFFFFFFF), this.epoch);
  }

  // Extract last timestamp and counter from state
  var lastTimestamp = shr64(this.state, this.counterBitLen);
  var counter = and64(this.state, this.counterBitMask);

  // Protect against clock moving backwards
  if (cmp64(now, lastTimestamp) < 0) {
    now = lastTimestamp;
  }

  if (cmp64(now, lastTimestamp) === 0) {
    // Same millisecond as last ID generation
    if (gte64(counter, this.counterBitMask)) {
      // Counter overflow, increment timestamp virtually
      now = add64(now, from32(1));
      counter = from32(1);
    } else {
      counter = add64(counter, from32(1));
    }
  } else {
    // New millisecond, reset counter
    counter = from32(1);
  }

  // Update state
  this.state = or64(shl64(now, this.counterBitLen), counter);

  // Construct the final MUID
  // Structure: [Timestamp][MachineID][ShardIndex][Counter]
  var timestampPart = shl64(now, this.timestampBitShift);
  var machineIDPart = shl64(this.machineID, this.machineIDShift);
  var shardIndexPart = shl64(from32(this.shardIndex), this.shardIndexShift);

  var muid = or64(or64(or64(timestampPart, machineIDPart), shardIndexPart), counter);

  return new MUID(muid);
};

/**
 * Sharded generators for better parallel performance
 * @constructor
 */
function ShardedGenerators() {
  // Determine number of shards based on CPU cores (or default to 4)
  var numCPU = 4; // Default fallback
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    numCPU = navigator.hardwareConcurrency;
  } else if (typeof require !== 'undefined') {
    try {
      var os = require('os');
      numCPU = os.cpus().length;
    } catch (e) {
      // Keep default
    }
  }

  var shardBits = 0;
  if (numCPU > 1) {
    shardBits = Math.min(Math.ceil(Math.log2(numCPU)), 5);
  }

  var defaultConfig = getDefaultConfig();
  var poolSize = 1 << shardBits;

  this.pool = [];
  this.size = poolSize;
  this.index = 0;

  // Create generators for each shard
  for (var i = 0; i < poolSize; i++) {
    this.pool.push(new Generator(defaultConfig, i, shardBits));
  }
}

/**
 * Get the next generator in round-robin fashion
 * @returns {Generator} Next generator
 */
ShardedGenerators.prototype.next = function () {
  var generator = this.pool[this.index];
  this.index = (this.index + 1) % this.size;
  return generator;
};

// Global sharded generators instance
var defaultShards = new ShardedGenerators();
var defaultGenerator = new Generator(getDefaultConfig(), 0, 0);

/**
 * Generate a new MUID using the default sharded generators
 * @returns {MUID} New unique ID
 */
function make() {
  return defaultGenerator.id();
}

/**
 * Create a new generator with custom configuration
 * @param {Config} config - Configuration object
 * @param {number} shardIndex - Shard index (optional)
 * @param {number} shardBitLen - Shard bit length (optional)
 * @returns {Generator} New generator
 */
function newGenerator(config, shardIndex, shardBitLen) {
  var defaultConfig = getDefaultConfig();
  var mergedConfig = {};

  // Manual object merge for Espruino compatibility
  for (var key in defaultConfig) {
    mergedConfig[key] = defaultConfig[key];
  }
  if (config) {
    for (var key in config) {
      mergedConfig[key] = config[key];
    }
  }

  return new Generator(mergedConfig, shardIndex || 0, shardBitLen || 0);
}

// Export for module systems or global use
var muid = {
  MUID: MUID,
  Generator: Generator,
  ShardedGenerators: ShardedGenerators,
  make: make,
  newGenerator: newGenerator,
  getDefaultConfig: getDefaultConfig,

  // 64-bit utility functions (for testing/advanced use)
  make64: make64,
  from32: from32,
  add64: add64,
  sub64: sub64,
  shl64: shl64,
  shr64: shr64,
  or64: or64,
  and64: and64,
  cmp64: cmp64
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = muid;
} else if (typeof exports !== 'undefined') {
  for (var key in muid) {
    exports[key] = muid[key];
  }
} else {
  // Global export for Espruino
  global.muid = muid;
} 
