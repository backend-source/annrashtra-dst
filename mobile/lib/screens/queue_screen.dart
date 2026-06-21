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
                  trailing: isError
                      ? TextButton(onPressed: () => s.retry(op), child: const Text('Retry'))
                      : null,
                );
              },
            ),
    );
  }
}
