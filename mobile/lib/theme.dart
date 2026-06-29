import 'package:flutter/material.dart';

/// Annrashtra brand colours, sampled from the logo (maroon wordmark, golden wheat,
/// green fields). Semantic mapping used across the app:
///   maroon = brand / actions, green = money & positive, gold = points/rewards.
class Brand {
  static const maroon = Color(0xFF8C1D24);
  static const maroonTint = Color(0xFFF7E7E8);

  static const gold = Color(0xFF9A6810);
  static const goldTint = Color(0xFFFAEED5);

  static const green = Color(0xFF456B17); // cash / positive
  static const greenTint = Color(0xFFEAF2DA);

  static const upi = Color(0xFF3C5A16); // UPI (a deeper green — also "money")
  static const upiTint = Color(0xFFE3EDCF);

  static const cream = Color(0xFFFBF7F2); // page background
}

ThemeData buildBrandTheme() {
  final scheme = ColorScheme.fromSeed(
    seedColor: Brand.maroon,
    primary: Brand.maroon,
  );
  return ThemeData(
    colorScheme: scheme,
    useMaterial3: true,
    scaffoldBackgroundColor: Brand.cream,
    appBarTheme: const AppBarTheme(
      backgroundColor: Brand.maroon,
      foregroundColor: Colors.white,
      elevation: 0,
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: Color(0xFFEDE5DC)),
      ),
      margin: const EdgeInsets.symmetric(vertical: 5),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Brand.maroon,
        foregroundColor: Colors.white,
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Brand.maroon : null,
        ),
        foregroundColor: WidgetStateProperty.resolveWith(
          (s) => s.contains(WidgetState.selected) ? Colors.white : Brand.maroon,
        ),
      ),
    ),
  );
}
