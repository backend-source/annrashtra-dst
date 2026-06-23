import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../services/api_client.dart';

class StockScreen extends StatefulWidget {
  const StockScreen({super.key});

  @override
  State<StockScreen> createState() => _StockScreenState();
}

class _StockScreenState extends State<StockScreen> {
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _requests = [];
  String? _productId;
  final _qty = TextEditingController();
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await context.read<AppState>().products();
      setState(() {
        _products = p;
        _productId = p.isNotEmpty ? p.first['id'] as String : null;
        _loading = false;
      });
    } on ApiException catch (e) {
      setState(() {
        _error = 'No product list available offline (${e.message})';
        _loading = false;
      });
    }
    _loadRequests();
  }

  Future<void> _loadRequests() async {
    try {
      final r = await context.read<AppState>().refillRequests();
      if (mounted) setState(() => _requests = r);
    } on ApiException {
      // offline — leave the list as-is
    }
  }

  Future<void> _submit({required String path, required String verb}) async {
    final qty = int.tryParse(_qty.text);
    if (_productId == null || qty == null || qty <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter a valid quantity')));
      return;
    }
    await context.read<AppState>().queueWrite(
      label: '$verb: $qty',
      path: path,
      body: {'product_id': _productId, 'qty': qty},
    );
    if (!mounted) return;
    _qty.clear();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$verb saved — will sync when online')));
    _loadRequests();
  }

  Future<void> _confirmDelivery(Map<String, dynamic> req) async {
    final controller = TextEditingController(text: '${req['qty']}');
    final qty = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm delivery'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Enter the quantity actually delivered from the factory:'),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Delivered quantity', border: OutlineInputBorder()),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, int.tryParse(controller.text)),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (qty == null || qty <= 0) return;
    try {
      await context.read<AppState>().confirmRefill(req['id'] as String, qty);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Delivery confirmed — stock updated')));
      _loadRequests();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  String _skuFor(String productId) {
    final p = _products.firstWhere((x) => x['id'] == productId, orElse: () => {});
    return (p['sku'] ?? p['name'] ?? productId).toString();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Stock & refills')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!)))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: _productId,
                      decoration: const InputDecoration(labelText: 'Product', border: OutlineInputBorder()),
                      items: _products
                          .map((p) => DropdownMenuItem(value: p['id'] as String, child: Text('${p['name']}')))
                          .toList(),
                      onChanged: (v) => setState(() => _productId = v),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _qty,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: 'Quantity', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: () => _submit(path: '/api/inventory/opening', verb: 'Opening stock'),
                      icon: const Icon(Icons.inventory),
                      label: const Text('Record opening stock'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: () => _submit(path: '/api/inventory/refill-requests', verb: 'Refill request'),
                      icon: const Icon(Icons.add_box),
                      label: const Text('Request refill (needs admin approval)'),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('My refill requests', style: TextStyle(fontWeight: FontWeight.w600)),
                        IconButton(onPressed: _loadRequests, icon: const Icon(Icons.refresh)),
                      ],
                    ),
                    if (_requests.isEmpty) const Text('No requests yet.', style: TextStyle(color: Colors.black54)),
                    ..._requests.map((r) => Card(
                          child: ListTile(
                            title: Text('${_skuFor(r['product_id'] as String)} · qty ${r['qty']}'),
                            subtitle: Text('Status: ${r['status']}'
                                '${r['delivered_qty'] != null ? ' · delivered ${r['delivered_qty']}' : ''}'),
                            trailing: r['status'] == 'approved'
                                ? FilledButton(
                                    onPressed: () => _confirmDelivery(r),
                                    child: const Text('Confirm delivery'),
                                  )
                                : null,
                          ),
                        )),
                  ],
                ),
    );
  }
}
