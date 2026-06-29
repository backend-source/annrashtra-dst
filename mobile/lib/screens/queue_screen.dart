import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../models/pending_op.dart';

class QueueScreen extends StatelessWidget {
  const QueueScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final ops = s.queue;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sync queue'),
        actions: [
          if (s.failedCount > 0)
            TextButton(
              onPressed: () => _confirmClearAll(context, s),
              child: const Text('Clear failed'),
            ),
          IconButton(
            onPressed: s.online ? () => s.flush() : null,
            icon: const Icon(Icons.sync),
            tooltip: s.online ? 'Sync now' : 'Offline',
          ),
        ],
      ),
      body: ops.isEmpty
          ? const Center(child: Text('Nothing pending — all synced.'))
          : ListView.separated(
              itemCount: ops.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) {
                final op = ops[i];
                final isError = op.status == OpStatus.error;
                return ListTile(
                  leading: Icon(
                    isError ? Icons.error_outline : Icons.schedule,
                    color: isError ? Colors.red : Colors.orange,
                  ),
                  title: Text(op.label),
                  subtitle: Text(
                    isError ? 'Failed: ${op.lastError}' : 'Waiting to sync · ${op.path}',
                  ),
                  // Failed items can be retried or dismissed. Pending items just wait
                  // (they auto-retry) — no dismiss, so real unsynced data can't be lost.
                  trailing: isError
                      ? Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            TextButton(onPressed: () => s.retry(op), child: const Text('Retry')),
                            IconButton(
                              tooltip: 'Dismiss',
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () => _confirmDismiss(context, s, op),
                            ),
                          ],
                        )
                      : null,
                );
              },
            ),
    );
  }

  Future<void> _confirmDismiss(BuildContext context, AppState s, PendingOp op) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Dismiss this item?'),
        content: Text(
          'This will remove the failed item "${op.label}" from the queue.\n\n'
          'It already failed on the server — it was either saved earlier or rejected as invalid, '
          'so nothing accepted is lost.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Dismiss')),
        ],
      ),
    );
    if (ok == true) await s.dismissOp(op);
  }

  Future<void> _confirmClearAll(BuildContext context, AppState s) async {
    final n = s.failedCount;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Clear $n failed item(s)?'),
        content: const Text(
          'This removes every failed item from the queue. Items still waiting to sync are kept.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Clear')),
        ],
      ),
    );
    if (ok == true) await s.clearFailed();
  }
}
