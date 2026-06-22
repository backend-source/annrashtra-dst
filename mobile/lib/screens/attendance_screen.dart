import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../services/api_client.dart';
import '../services/location_service.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  List<Map<String, dynamic>> _locations = [];
  String? _locationId;
  String _shift = 'morning';
  final _lat = TextEditingController();
  final _lng = TextEditingController();
  bool _loading = true;
  bool _locating = false;
  String? _error;

  Future<void> _useGps() async {
    setState(() => _locating = true);
    try {
      final loc = await LocationService.current();
      _lat.text = loc.lat.toStringAsFixed(6);
      _lng.text = loc.lng.toStringAsFixed(6);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))),
        );
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final l = await context.read<AppState>().locations();
      setState(() {
        _locations = l;
        _locationId = l.isNotEmpty ? l.first['id'] as String : null;
        if (l.isNotEmpty) {
          _lat.text = '${l.first['lat'] ?? ''}';
          _lng.text = '${l.first['lng'] ?? ''}';
        }
        _loading = false;
      });
    } on ApiException catch (e) {
      setState(() {
        _error = 'No locations available offline (${e.message})';
        _loading = false;
      });
    }
  }

  Future<void> _checkIn() async {
    if (_locationId == null) return;
    await context.read<AppState>().queueWrite(
      label: 'Check-in ($_shift)',
      path: '/api/attendance/check-in',
      body: {
        'location_id': _locationId,
        'shift': _shift,
        'gps_lat': double.tryParse(_lat.text),
        'gps_lng': double.tryParse(_lng.text),
        // Photo upload (Firebase) is wired on Android; placeholder URL for now.
        'selfie_url': 'pending-upload',
      },
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Check-in saved — will sync when online')),
    );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Attendance')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!)))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    DropdownButtonFormField<String>(
                      initialValue: _locationId,
                      decoration: const InputDecoration(labelText: 'Location', border: OutlineInputBorder()),
                      items: _locations
                          .map((l) => DropdownMenuItem(value: l['id'] as String, child: Text('${l['name']}')))
                          .toList(),
                      onChanged: (v) {
                        setState(() {
                          _locationId = v;
                          final loc = _locations.firstWhere((l) => l['id'] == v);
                          _lat.text = '${loc['lat'] ?? ''}';
                          _lng.text = '${loc['lng'] ?? ''}';
                        });
                      },
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: _shift,
                      decoration: const InputDecoration(labelText: 'Shift', border: OutlineInputBorder()),
                      items: const ['morning', 'evening']
                          .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                          .toList(),
                      onChanged: (v) => setState(() => _shift = v ?? 'morning'),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton.icon(
                      onPressed: _locating ? null : _useGps,
                      icon: const Icon(Icons.my_location),
                      label: Text(_locating ? 'Locating…' : 'Use my current location'),
                    ),
                    const SizedBox(height: 12),
                    Row(children: [
                      Expanded(
                        child: TextField(
                          controller: _lat,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(labelText: 'GPS lat', border: OutlineInputBorder()),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: TextField(
                          controller: _lng,
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          decoration: const InputDecoration(labelText: 'GPS lng', border: OutlineInputBorder()),
                        ),
                      ),
                    ]),
                    const SizedBox(height: 8),
                    const Text('Tap "Use my current location" to capture GPS. Selfie capture is added next.',
                        style: TextStyle(color: Colors.black54, fontSize: 12)),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                        onPressed: _checkIn, icon: const Icon(Icons.login), label: const Text('Check in')),
                  ],
                ),
    );
  }
}
