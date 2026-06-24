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
  final _amount = TextEditingController();
  List<Map<String, dynamic>> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final c = await context.read<AppState>().collections();
      if (mounted) setState(() { _items = c; _loading = false; });
    } on ApiException {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _handover() async {
    final amount = double.tryParse(_amount.text.trim());
    if (amount == null || amount < 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a valid amount')));
      return;
    }
    await context.read<AppState>().queueWrite(
      label: 'Cash handover ₹${amount.toStringAsFixed(0)}',
      path: '/api/collections',
      body: {'amount': amount},
    );
    if (!mounted) return;
    _amount.clear();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Handover recorded — will sync; supervisor confirms receipt')),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cash handover')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          TextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
                labelText: 'Amount handed over (₹)', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _handover,
            icon: const Icon(Icons.payments),
            label: const Text('Hand over to supervisor'),
          ),
          const SizedBox(height: 8),
          const Text('The supervisor verifies and confirms receipt; status updates to "received".',
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
          ..._items.map((c) {
            final received = c['status'] == 'received';
            return Card(
              child: ListTile(
                title: Text('${c['day']} · ₹${c['amount']}'),
                subtitle: Text('Expected cash: ₹${c['expected_cash']}'),
                trailing: Chip(
                  label: Text(received ? 'received' : 'pending'),
                  backgroundColor: received ? Colors.green.shade100 : Colors.orange.shade100,
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
