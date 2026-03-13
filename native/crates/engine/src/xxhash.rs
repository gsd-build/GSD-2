//! xxHash32 exposed to JS via N-API.
//!
//! Wraps `xxhash_rust::xxh32` to provide a drop-in replacement for the pure-JS
//! xxHash32 used by the hashline edit tool.

use napi_derive::napi;

/// Compute xxHash32 of a UTF-8 string with the given seed.
///
/// Matches the behavior of the pure-JS `xxHash32(input, seed)` in hashline.ts:
/// the input string is converted to UTF-8 bytes and hashed.
#[napi(js_name = "xxHash32")]
pub fn xx_hash32(input: String, seed: u32) -> u32 {
	xxhash_rust::xxh32::xxh32(input.as_bytes(), seed)
}

#[cfg(test)]
mod tests {
	use super::*;

	/// Reference vectors verified against the pure-JS implementation.
	#[test]
	fn known_vectors() {
		// Empty string, seed 0
		assert_eq!(xx_hash32(String::new(), 0), 0x02CC5D05);
		// "hello", seed 0
		assert_eq!(xx_hash32("hello".into(), 0), 0xFB0DA52A);
		// "hello", seed 42
		assert_eq!(xx_hash32("hello".into(), 42), 0x0AA8E13E);
	}

	#[test]
	fn short_and_long_inputs() {
		// < 16 bytes (no stripe loop)
		let short = xx_hash32("abc".into(), 0);
		assert_ne!(short, 0);

		// >= 16 bytes (enters stripe loop)
		let long = xx_hash32("abcdefghijklmnop".into(), 0);
		assert_ne!(long, 0);
		assert_ne!(short, long);
	}
}
