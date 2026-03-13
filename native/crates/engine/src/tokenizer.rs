//! BPE token counting via tiktoken-rs.
//!
//! Lazily initializes the cl100k_base encoding (used by Claude, GPT-4, etc.)
//! on first call. Subsequent calls reuse the cached encoder.

use napi::bindgen_prelude::*;
use napi::{JsObject, JsUnknown, ValueType};
use napi_derive::napi;
use std::sync::OnceLock;
use tiktoken_rs::CoreBPE;

/// Cached encoder — initialized once on first use.
static ENCODER: OnceLock<CoreBPE> = OnceLock::new();

fn get_encoder() -> &'static CoreBPE {
    ENCODER.get_or_init(|| {
        tiktoken_rs::cl100k_base().expect("failed to initialize cl100k_base tokenizer")
    })
}

/// Count the number of BPE tokens in a string.
#[napi]
pub fn count_tokens(text: String) -> u32 {
    get_encoder().encode_ordinary(&text).len() as u32
}

/// Count BPE tokens for each string in a batch.
#[napi]
pub fn count_tokens_batch(texts: Vec<String>) -> Vec<u32> {
    let enc = get_encoder();
    texts
        .iter()
        .map(|t| enc.encode_ordinary(t).len() as u32)
        .collect()
}

/// Helper: get a string property from a JS object, returning None if missing or wrong type.
fn get_string_prop(obj: &JsObject, key: &str) -> Result<Option<String>> {
    match obj.get_named_property::<JsUnknown>(key) {
        Ok(val) => {
            if val.get_type()? == ValueType::String {
                let s: String = val.coerce_to_string()?.into_utf8()?.as_str()?.to_owned();
                Ok(Some(s))
            } else {
                Ok(None)
            }
        }
        Err(_) => Ok(None),
    }
}

/// Count tokens in a string using the cached encoder.
fn count_str(text: &str) -> usize {
    get_encoder().encode_ordinary(text).len()
}

/// Process a content block (object with `type` field).
fn process_content_block(env: &Env, block: &JsObject) -> Result<usize> {
    let block_type = get_string_prop(block, "type")?;
    let block_type = block_type.as_deref().unwrap_or("");

    match block_type {
        "text" => {
            if let Some(t) = get_string_prop(block, "text")? {
                Ok(count_str(&t))
            } else {
                Ok(0)
            }
        }
        "thinking" => {
            if let Some(t) = get_string_prop(block, "thinking")? {
                Ok(count_str(&t))
            } else {
                Ok(0)
            }
        }
        "toolCall" => {
            let mut n = 0;
            if let Some(name) = get_string_prop(block, "name")? {
                n += count_str(&name);
            }
            // Stringify the arguments object
            if let Ok(args_val) = block.get_named_property::<JsUnknown>("arguments") {
                if args_val.get_type()? == ValueType::Object {
                    // Use JSON.stringify equivalent — serialize via napi env
                    let global = env.get_global()?;
                    let json: JsObject = global.get_named_property("JSON")?;
                    let stringify: napi::JsFunction = json.get_named_property("stringify")?;
                    let result = stringify.call(Some(&json), &[args_val])?;
                    if result.get_type()? == ValueType::String {
                        let s: String = result.coerce_to_string()?.into_utf8()?.as_str()?.to_owned();
                        n += count_str(&s);
                    }
                }
            }
            Ok(n)
        }
        "image" => Ok(1200),
        _ => {
            // Unknown block — try text field
            if let Some(t) = get_string_prop(block, "text")? {
                Ok(count_str(&t))
            } else {
                Ok(0)
            }
        }
    }
}

/// Estimate the token count of a chat message object.
///
/// Accepts a JS object with `role` and `content` fields. Content can be a
/// string or an array of content blocks. Adds a small overhead per message
/// for role/framing tokens.
#[napi(ts_args_type = "message: { role: string; content: unknown; [key: string]: unknown }")]
pub fn estimate_message_tokens(env: Env, message: JsObject) -> Result<u32> {
    let mut total: usize = 4; // per-message framing overhead

    let role = get_string_prop(&message, "role")?;
    let role_str = role.as_deref().unwrap_or("");

    // Process content field
    if let Ok(content_val) = message.get_named_property::<JsUnknown>("content") {
        match content_val.get_type()? {
            ValueType::String => {
                let s: String = content_val.coerce_to_string()?.into_utf8()?.as_str()?.to_owned();
                total += count_str(&s);
            }
            ValueType::Object => {
                // Check if it's an array
                let content_obj: JsObject = unsafe { content_val.cast() };
                if content_obj.is_array()? {
                    let len = content_obj.get_array_length()?;
                    for i in 0..len {
                        let block: JsObject = content_obj.get_element(i)?;
                        total += process_content_block(&env, &block)?;
                    }
                }
            }
            _ => {}
        }
    }

    // Handle bashExecution messages
    if role_str == "bashExecution" {
        if let Some(cmd) = get_string_prop(&message, "command")? {
            total += count_str(&cmd);
        }
        if let Some(output) = get_string_prop(&message, "output")? {
            total += count_str(&output);
        }
    }

    // Handle summary messages (branchSummary, compactionSummary)
    if let Some(summary) = get_string_prop(&message, "summary")? {
        total += count_str(&summary);
    }

    Ok(total as u32)
}
