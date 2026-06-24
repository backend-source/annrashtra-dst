import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import 'lead_form_screen.dart';
import 'sale_form_screen.dart';
import 'attendance_screen.dart';
import 'stock_screen.dart';
import 'cash_handover_screen.dart';
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
          const SizedBox(height: 12),
          const _MyStats(),
          const SizedBox(height: 16),
          _Tile(icon: Icons.person_add, label: 'Capture lead', builder: () => const LeadFormScreen()),
          _Tile(icon: Icons.point_of_sale, label: 'Record sale', builder: () => const SaleFormScreen()),
          _Tile(icon: Icons.how_to_reg, label: 'Attendance', builder: () => const AttendanceScreen()),
          _Tile(icon: Icons.inventory_2, label: 'Stock & refills', builder: () => const StockScreen()),
          _Tile(icon: Icons.payments, label: 'Cash handover', builder: () => const CashHandoverScreen()),
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

class _MyStats extends StatefulWidget {
  const _MyStats();
  @override
  State<_MyStats> createState() => _MyStatsState();
}

class _MyStatsState extends State<_MyStats> {
  Map<String, dynamic>? _data;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final d = await context.read<AppState>().overview();
    if (mounted) setState(() { _data = d; _loading = false; });
  }

  Widget _stat(String label, String value) => Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            Text(label, style: const TextStyle(fontSize: 11, color: Colors.black54)),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Card(child: Padding(padding: EdgeInsets.all(20), child: Center(child: SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)))));
    }
    if (_data == null) return const SizedBox.shrink();
    final k = Map<String, dynamic>.from(_data!['kpis'] as Map);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('My week', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            Row(children: [
              _stat('Revenue', '₹${k['revenue_week']}'),
              _stat('Units', '${k['units_week']}'),
              _stat('Points', '${k['points']}'),
            ]),
            const SizedBox(height: 12),
            Row(children: [
              _stat('Leads', '${k['leads_total']}'),
              _stat('Converted', '${k['leads_converted']}'),
              _stat('Check-ins today', '${k['checkins_today']}'),
            ]),
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
