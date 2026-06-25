import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import 'lead_form_screen.dart';
import 'sale_form_screen.dart';
import 'attendance_screen.dart';
import 'my_spot_screen.dart';
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
          _Tile(icon: Icons.place, label: 'My spot', builder: () => const MySpotScreen()),
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
  String _period = 'today';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final d = await context.read<AppState>().myDashboard(_period);
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
    final d = _data;
    final stock = (d?['stock_by_sku'] as List?) ?? const [];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('My dashboard', style: TextStyle(fontWeight: FontWeight.w600)),
                SegmentedButton<String>(
                  style: const ButtonStyle(visualDensity: VisualDensity.compact),
                  segments: const [
                    ButtonSegment(value: 'today', label: Text('Today')),
                    ButtonSegment(value: 'week', label: Text('Week')),
                  ],
                  selected: {_period},
                  onSelectionChanged: (s) { setState(() => _period = s.first); _load(); },
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (_loading)
              const Padding(padding: EdgeInsets.all(16), child: Center(child: SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))))
            else if (d == null)
              const Text('Stats unavailable offline.', style: TextStyle(color: Colors.black54))
            else ...[
              Row(children: [
                _stat('Leads', '${d['leads']}'),
                _stat('Cash in hand', '₹${d['cash_in_hand']}'),
                _stat('UPI in hand', '₹${d['upi_in_hand']}'),
                _stat('Points', '${d['points']}'),
              ]),
              const Divider(height: 24),
              const Text('Stock in hand', style: TextStyle(fontSize: 12, color: Colors.black54)),
              const SizedBox(height: 6),
              if (stock.isEmpty)
                const Text('—', style: TextStyle(color: Colors.black54))
              else
                ...stock.map((s) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('${s['sku']}'),
                          Text('${s['in_hand']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                        ],
                      ),
                    )),
            ],
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
