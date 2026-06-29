import 'api_client.dart';
import 'local_store.dart';
import '../models/pending_op.dart';

class SyncResult {
  final int synced;
  final int failed;
  final int remaining;
  SyncResult(this.synced, this.failed, this.remaining);
}

/// Flushes the offline write queue to the API. Every op carries a client_uuid,
/// so the server dedupes replays — a retry can never create a duplicate.
class SyncService {
  final ApiClient api;
  final LocalStore store;
  bool _running = false;

  SyncService(this.api, this.store);

  Future<SyncResult> flush() async {
    if (_running) return SyncResult(0, 0, store.queue.length);
    _running = true;
    var synced = 0, failed = 0;
    try {
      for (final op in store.queue) {
        if (op.status == OpStatus.error) continue; // needs manual retry
        try {
          await api.post(op.path, op.body);
          await store.removeOp(op.clientUuid); // 2xx or idempotent replay -> done
          synced++;
        } on ApiException catch (e) {
          // Transient — offline, server waking (5xx), timeout, or rate-limited.
          // Keep the whole queue PENDING and stop; the next flush auto-retries.
          // (This is what stops cold-start timeouts from sticking as "failed".)
          if (e.isNetwork || e.statusCode >= 500 || e.statusCode == 408 || e.statusCode == 429) break;
          // Permanent (4xx) — the server rejected it and a retry won't help.
          // Mark failed so it doesn't block the rest; the user can dismiss it
          // (safe: client_uuid means it's either already saved or invalid).
          op.status = OpStatus.error;
          op.lastError = e.message;
          op.attempts += 1;
          await store.putOp(op);
          failed++;
        }
      }
    } finally {
      _running = false;
    }
    return SyncResult(synced, failed, store.queue.length);
  }

  /// Re-queue an errored op for another attempt (user-triggered).
  Future<void> retry(PendingOp op) async {
    op.status = OpStatus.pending;
    op.lastError = null;
    await store.putOp(op);
  }
}
