import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import 'lead_form_screen.dart';
import 'sale_form_screen.dart';
import 'attendance_screen.dart';
import 'stock_screen.dart';
import 'queue_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final name = (s.user?['name'] ?? 'Promoter').toString();
    return Scaffold(
      appBar: AppBar(
        title: Text('Hi, $name'),
        actions: [
          IconButton(onPressed: s.logout, icon: const Icon(Icons.logout), tooltip: 'Log out'),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _StatusCard(online: s.online, pending: s.pendingCount, onSync: s.flush),
          const SizedBox(height: 16),
          _Tile(icon: Icons.person_add, label: 'Capture lead', builder: () => const LeadFormScreen()),
          _Tile(icon: Icons.point_of_sale, label: 'Record sale', builder: () => const SaleFormScreen()),
          _Tile(icon: Icons.how_to_reg, label: 'Attendance', builder: () => const AttendanceScreen()),
          _Tile(icon: Icons.inventory_2, label: 'Stock & refills', builder: () => const StockScreen()),
          _Tile(icon: Icons.sync, label: 'Sync queue', builder: () => const QueueScreen()),
        ],
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  final bool online;
  final int pending;
  final Future<void> Function() onSync;
  const _StatusCard({required this.online, required this.pending, required this.onSync});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(online ? Icons.cloud_done : Icons.cloud_off,
                color: online ? Colors.green : Colors.orange),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(online ? 'Online' : 'Offline',
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                  Text(pending == 0 ? 'All changes synced' : '$pending change(s) waiting to sync',
                      style: const TextStyle(color: Colors.black54)),
                ],
              ),
            ),
            if (pending > 0)
              FilledButton.tonal(onPressed: onSync, child: const Text('Sync now')),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Widget Function() builder;
  const _Tile({required this.icon, required this.label, required this.builder});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(label),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => builder())),
      ),
    );
  }
}
