import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:image_picker/image_picker.dart';
import '../state/app_state.dart';
import '../services/api_client.dart';
import '../services/location_service.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  final _picker = ImagePicker();
  List<Map<String, dynamic>> _locations = [];
  String? _locationId;
  String _shift = 'morning';
  final _lat = TextEditingController();
  final _lng = TextEditingController();
  XFile? _selfie;
  XFile? _canopy;
  Uint8List? _selfieBytes;
  Uint8List? _canopyBytes;
  bool _loading = true;
  bool _locating = false;
  bool _submitting = false;
  String? _error;
  List<Map<String, dynamic>> _myCheckins = [];
  String? _coId; // id currently being checked out

  @override
  void initState() {
    super.initState();
    _load();
    _loadMine();
  }

  // The promoter's recent check-ins (online) so they can check out. Best-effort:
  // if offline it just stays empty.
  Future<void> _loadMine() async {
    try {
      final m = await context.read<AppState>().myAttendance();
      if (mounted) setState(() => _myCheckins = m);
    } on ApiException {
      // offline — leave the list as-is
    }
  }

  Future<void> _checkOut(String id) async {
    setState(() => _coId = id);
    try {
      await context.read<AppState>().checkOut(id);
      await _loadMine();
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.isNetwork ? 'Check-out needs a connection' : e.message)));
      }
    } finally {
      if (mounted) setState(() => _coId = null);
    }
  }

  Future<void> _load() async {
    try {
      final all = await context.read<AppState>().locations();
      // Only supervisor-confirmed ('active') spots can be checked into.
      final l = all.where((x) => (x['status'] ?? 'active') == 'active').toList();
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

  Future<void> _capture(bool isSelfie) async {
    final file = await _picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 1280,
      imageQuality: 70,
      preferredCameraDevice: isSelfie ? CameraDevice.front : CameraDevice.rear,
    );
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() {
      if (isSelfie) {
        _selfie = file;
        _selfieBytes = bytes;
      } else {
        _canopy = file;
        _canopyBytes = bytes;
      }
    });
  }

  Future<void> _checkIn() async {
    if (_locationId == null) return;
    if (_selfie == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Capture a selfie first')));
      return;
    }
    setState(() => _submitting = true);
    try {
      final s = context.read<AppState>();
      final selfieUrl = await s.photoUploader.upload(_selfie!, 'selfies');
      final canopyUrl = _canopy != null ? await s.photoUploader.upload(_canopy!, 'canopy') : null;
      await s.queueWrite(
        label: 'Check-in ($_shift)',
        path: '/api/attendance/check-in',
        body: {
          'location_id': _locationId,
          'shift': _shift,
          'gps_lat': double.tryParse(_lat.text),
          'gps_lng': double.tryParse(_lng.text),
          'selfie_url': selfieUrl,
          'canopy_photo_url': ?canopyUrl,
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Check-in saved — will sync when online')),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      // The photo upload needs a connection; don't save a check-in without it.
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(e.isNetwork
            ? 'No connection — the photo needs internet. Please try again when online.'
            : 'Photo upload failed: ${e.message}'),
      ));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Widget _photoBox(String label, Uint8List? bytes, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        height: 120,
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade400),
          borderRadius: BorderRadius.circular(8),
        ),
        child: bytes == null
            ? Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.camera_alt, color: Colors.black54),
                  const SizedBox(height: 4),
                  Text(label, style: const TextStyle(color: Colors.black54)),
                ],
              )
            : ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.memory(bytes, fit: BoxFit.cover, width: double.infinity),
              ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Attendance')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!)))
              : _locations.isEmpty
                  ? const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Text(
                          'No confirmed spot yet.\n\nGo to "My spot", set your location, and ask your supervisor to confirm it. Then you can check in here.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Colors.black54),
                        ),
                      ),
                    )
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
                    const SizedBox(height: 16),
                    Row(children: [
                      Expanded(child: _photoBox('Selfie *', _selfieBytes, () => _capture(true))),
                      const SizedBox(width: 12),
                      Expanded(child: _photoBox('Canopy', _canopyBytes, () => _capture(false))),
                    ]),
                    const SizedBox(height: 8),
                    const Text('Tap a box to capture with the camera. Photos upload when you are online.',
                        style: TextStyle(color: Colors.black54, fontSize: 12)),
                    const SizedBox(height: 16),
                    FilledButton.icon(
                      onPressed: _submitting ? null : _checkIn,
                      icon: const Icon(Icons.login),
                      label: Text(_submitting ? 'Saving…' : 'Check in'),
                    ),
                    const SizedBox(height: 24),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('My recent check-ins', style: TextStyle(fontWeight: FontWeight.w600)),
                        IconButton(onPressed: _loadMine, icon: const Icon(Icons.refresh)),
                      ],
                    ),
                    if (_myCheckins.isEmpty)
                      const Text('None yet (or offline). Synced check-ins appear here.',
                          style: TextStyle(color: Colors.black54, fontSize: 12)),
                    ..._myCheckins.map(_checkinCard),
                  ],
                ),
    );
  }

  Widget _checkinCard(Map<String, dynamic> c) {
    final id = c['id'] as String;
    final out = c['check_out_at'] as String?;
    final busy = _coId == id;
    return Card(
      child: ListTile(
        title: Text('${c['shift']} · ${c['location_name'] ?? '—'}'),
        subtitle: Text('In: ${c['check_in_at']}${out != null ? '\nOut: $out' : ''}'),
        isThreeLine: out != null,
        trailing: out != null
            ? const Chip(label: Text('checked out'))
            : FilledButton(
                onPressed: busy ? null : () => _checkOut(id),
                child: Text(busy ? '…' : 'Check out'),
              ),
      ),
    );
  }
}
