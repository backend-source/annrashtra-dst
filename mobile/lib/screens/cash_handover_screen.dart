import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../services/api_client.dart';

class CashHandoverScreen extends StatefulWidget {
  const CashHandoverScreen({super.key});

  @override
  State<CashHandoverScreen> createState() => _CashHandoverScreenState();
}

class _CashHandoverScreenState extends State<CashHandoverScreen> {
  final _cash = TextEditingController();
  final _upi = TextEditingController();
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;
  String? _actingId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = context.read<AppState>();
    // Pre-fill the handover with what they currently hold (as per today's sales).
    try {
      final d = await s.myDashboard('today');
      if (d != null && mounted) {
        if (_cash.text.isEmpty) _cash.text = '${d['cash_in_hand'] ?? ''}';
        if (_upi.text.isEmpty) _upi.text = '${d['upi_in_hand'] ?? ''}';
      }
    } on ApiException {
      // offline — leave the fields blank
    }
    try {
      final c = await s.collections();
      if (mounted) setState(() { _items = c; _loading = false; });
    } on ApiException {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _handover() async {
    final cash = double.tryParse(_cash.text.trim()) ?? 0;
    final upi = double.tryParse(_upi.text.trim()) ?? 0;
    if (cash < 0 || upi < 0 || (cash + upi) <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a cash or UPI amount')));
      return;
    }
    await context.read<AppState>().queueWrite(
      label: 'Handover ₹${(cash + upi).toStringAsFixed(0)}',
      path: '/api/collections',
      body: {'amount': cash, 'upi_amount': upi},
    );
    if (!mounted) return;
    _cash.clear();
    _upi.clear();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Handover recorded — will sync; supervisor verifies next')),
    );
    _load();
  }

  Future<void> _accept(String id) async {
    setState(() => _actingId = id);
    try {
      await context.read<AppState>().acceptCollection(id);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Accepted — handover confirmed')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _actingId = null);
    }
  }

  Future<void> _dispute(String id) async {
    final note = await _askNote();
    if (note == null || !mounted) return;
    setState(() => _actingId = id);
    try {
      await context.read<AppState>().disputeCollection(id, note);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sent back to supervisor')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _actingId = null);
    }
  }

  Future<String?> _askNote() {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('What is wrong?'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(hintText: 'e.g. cash amount is short'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('Send back')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cash handover')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            Expanded(child: TextField(
              controller: _cash,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Cash (₹)', border: OutlineInputBorder()),
            )),
            const SizedBox(width: 12),
            Expanded(child: TextField(
              controller: _upi,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'UPI (₹)', border: OutlineInputBorder()),
            )),
          ]),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _handover,
            icon: const Icon(Icons.payments),
            label: const Text('Hand over to supervisor'),
          ),
          const SizedBox(height: 8),
          const Text('The supervisor verifies the amounts; then you accept to confirm.',
              style: TextStyle(color: Colors.black54, fontSize: 12)),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('My handovers', style: TextStyle(fontWeight: FontWeight.w600)),
              IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
            ],
          ),
          if (_loading) const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
          if (!_loading && _items.isEmpty) const Text('No handovers yet.', style: TextStyle(color: Colors.black54)),
          ..._items.map(_handoverCard),
        ],
      ),
    );
  }

  Widget _handoverCard(Map<String, dynamic> c) {
    final status = c['status'] as String? ?? 'pending';
    final id = c['id'] as String;
    final acting = _actingId == id;
    final colors = {
      'received': Colors.green.shade100,
      'verified': Colors.blue.shade100,
      'disputed': Colors.red.shade100,
      'pending': Colors.orange.shade100,
    };
    final labels = {
      'received': 'accepted',
      'verified': 'verify by you',
      'disputed': 'disputed',
      'pending': 'pending',
    };
    return Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ListTile(
            title: Text('${c['day']} · Cash ₹${c['amount']} · UPI ₹${c['upi_amount'] ?? 0}'),
            subtitle: Text('Expected cash ₹${c['expected_cash']} · UPI ₹${c['expected_upi'] ?? 0}'),
            trailing: Chip(
              label: Text(labels[status] ?? status),
              backgroundColor: colors[status] ?? Colors.grey.shade200,
            ),
          ),
          // When the supervisor has verified, the promoter accepts or disputes.
          if (status == 'verified')
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
              child: Row(
                children: [
                  FilledButton(
                    onPressed: acting ? null : () => _accept(id),
                    child: Text(acting ? '…' : 'Accept'),
                  ),
                  const SizedBox(width: 8),
                  OutlinedButton(
                    onPressed: acting ? null : () => _dispute(id),
                    child: const Text('Dispute'),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
