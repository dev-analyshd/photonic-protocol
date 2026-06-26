/// PHOTONIC — CAP (CROO Agent Protocol) Integration Layer
///
/// Implements the adapter pattern to plug PHOTONIC primitives
/// into the CAP L3 order lifecycle:
///   Negotiate → Lock → Deliver → Clear
///
/// Also provides:
/// - provider.rs: CAP provider daemon (registers agent, polls intents)
/// - listener.rs: WebSocket event listener for CAP events

pub mod adapter;
pub mod provider;
pub mod listener;

pub use adapter::{CAPOrder, CAPAdapter};
pub use provider::{CAPProvider, ProviderConfig};
pub use listener::{CAPListener, CAPEvent};
