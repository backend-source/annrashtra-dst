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
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$verb saved — will sync when online')),
    );
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
                      label: const Text('Request refill (needs supervisor approval)'),
                    ),
                  ],
                ),
    );
  }
}
