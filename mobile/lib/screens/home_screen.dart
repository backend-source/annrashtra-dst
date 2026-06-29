import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../theme.dart';
import 'lead_form_screen.dart';
import 'sale_form_screen.dart';
import 'attendance_screen.dart';
import 'my_spot_screen.dart';
import 'stock_screen.dart';
import 'cash_handover_screen.dart';
import 'queue_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _dashKey = GlobalKey<_MyStatsState>();
  void _refreshDash() => _dashKey.currentState?.reload();

  // The action tiles, in the agreed order (My Spot → Attendance → …). Each colour
  // is a brand tint so the grid reads as one product.
  List<_TileData> get _tiles => [
        _TileData(Icons.place, 'My spot', Brand.maroon, Brand.maroonTint, () => const MySpotScreen()),
        _TileData(Icons.how_to_reg, 'Attendance', Brand.green, Brand.greenTint, () => const AttendanceScreen()),
        _TileData(Icons.person_add, 'Capture lead', Brand.gold, Brand.goldTint, () => const LeadFormScreen()),
        _TileData(Icons.point_of_sale, 'Record sale', Brand.maroon, Brand.maroonTint, () => const SaleFormScreen()),
        _TileData(Icons.inventory_2, 'Stock & refills', Brand.upi, Brand.upiTint, () => const StockScreen()),
        _TileData(Icons.payments, 'Cash handover', Brand.green, Brand.greenTint, () => const CashHandoverScreen()),
        _TileData(Icons.sync, 'Sync queue', Brand.gold, Brand.goldTint, () => const QueueScreen()),
      ];

  @override
  Widget build(BuildContext context) {
    final s = context.watch<AppState>();
    final name = (s.user?['name'] ?? 'Promoter').toString();
    final code = (s.user?['emp_code'] ?? '').toString();
    return Scaffold(
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          _HeaderBand(name: name, code: code, onLogout: s.logout),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _StatusCard(online: s.online, pending: s.pendingCount, onSync: () async { await s.flush(); _refreshDash(); }),
                const SizedBox(height: 12),
                _MyStats(key: _dashKey),
                const SizedBox(height: 16),
                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 1.7,
                  children: _tiles
                      .map((t) => _GridTile(data: t, onReturn: _refreshDash))
                      .toList(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// Maroon brand header with greeting, date, code and logout.
class _HeaderBand extends StatelessWidget {
  final String name;
  final String code;
  final VoidCallback onLogout;
  const _HeaderBand({required this.name, required this.code, required this.onLogout});

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    final date = '${now.day} ${months[now.month - 1]}';
    return Container(
      width: double.infinity,
      color: Brand.maroon,
      padding: EdgeInsets.fromLTRB(16, MediaQuery.of(context).padding.top + 16, 16, 18),
      child: Row(
        children: [
          const CircleAvatar(radius: 20, backgroundColor: Colors.white, child: Icon(Icons.eco, color: Brand.green)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Hi, $name', style: const TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w600)),
                Text(code.isEmpty ? date : '$date · $code', style: const TextStyle(color: Color(0xFFF0C9A8), fontSize: 12)),
              ],
            ),
          ),
          IconButton(onPressed: onLogout, icon: const Icon(Icons.logout, color: Color(0xFFF0C9A8)), tooltip: 'Log out'),
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
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Icon(online ? Icons.cloud_done : Icons.cloud_off, color: online ? Brand.green : Colors.orange),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(online ? 'Online' : 'Offline', style: const TextStyle(fontWeight: FontWeight.bold)),
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
  const _MyStats({super.key});
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

  void reload() => _load();

  Future<void> _load() async {
    setState(() => _loading = true);
    final d = await context.read<AppState>().myDashboard(_period);
    if (mounted) setState(() { _data = d; _loading = false; });
  }

  num _num(dynamic v) => num.tryParse('$v') ?? 0;

  @override
  Widget build(BuildContext context) {
    final d = _data;
    final stock = (d?['stock_by_sku'] as List?) ?? const [];
    final inHand = d == null ? 0 : _num(d['cash_in_hand']) + _num(d['upi_in_hand']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Text('My dashboard', style: TextStyle(fontWeight: FontWeight.w600)),
                const Spacer(),
                IconButton(visualDensity: VisualDensity.compact, padding: EdgeInsets.zero,
                    onPressed: _load, icon: const Icon(Icons.refresh, size: 18)),
                const SizedBox(width: 4),
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
            const SizedBox(height: 8),
            if (_loading)
              const Padding(padding: EdgeInsets.all(16), child: Center(child: SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))))
            else if (d == null)
              const Text('Stats unavailable offline.', style: TextStyle(color: Colors.black54))
            else ...[
              // Hero: total money in hand right now.
              Text('₹$inHand', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: Brand.maroon)),
              const Text('in hand', style: TextStyle(fontSize: 12, color: Colors.black54)),
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 2.4,
                children: [
                  _StatCard(Icons.people, 'Leads', '${d['leads']}', Brand.maroon, Brand.maroonTint),
                  _StatCard(Icons.payments, 'Cash in hand', '₹${d['cash_in_hand']}', Brand.green, Brand.greenTint),
                  _StatCard(Icons.smartphone, 'UPI in hand', '₹${d['upi_in_hand']}', Brand.upi, Brand.upiTint),
                  _StatCard(Icons.star, 'Points', '${d['points']}', Brand.gold, Brand.goldTint),
                ],
              ),
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

class _StatCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;
  final Color tint;
  const _StatCard(this.icon, this.label, this.value, this.color, this.tint);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: tint, borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: color), overflow: TextOverflow.ellipsis),
                Text(label, style: TextStyle(fontSize: 10, color: color)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TileData {
  final IconData icon;
  final String label;
  final Color color;
  final Color tint;
  final Widget Function() builder;
  _TileData(this.icon, this.label, this.color, this.tint, this.builder);
}

class _GridTile extends StatelessWidget {
  final _TileData data;
  final VoidCallback? onReturn;
  const _GridTile({required this.data, this.onReturn});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () async {
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => data.builder()));
        onReturn?.call();
      },
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFEDE5DC)),
        ),
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(color: data.tint, shape: BoxShape.circle),
              child: Icon(data.icon, color: data.color, size: 20),
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(data.label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
          ],
        ),
      ),
    );
  }
}
