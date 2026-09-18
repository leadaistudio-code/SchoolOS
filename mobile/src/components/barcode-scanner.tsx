import React from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import { Button, Txt } from '@/components/ui'
import { colors, spacing } from '@/theme'

/**
 * Full-screen camera barcode scanner for admit cards.
 * Accepts the same codes the web desk does (QR / Code128 / etc.).
 */
export function BarcodeScannerModal({
  visible,
  onClose,
  onScan,
}: {
  visible: boolean
  onClose: () => void
  onScan: (value: string) => void
}) {
  const [permission, requestPermission] = useCameraPermissions()
  const locked = React.useRef(false)

  React.useEffect(() => {
    if (visible) locked.current = false
  }, [visible])

  function handleBarCode(result: BarcodeScanningResult) {
    if (locked.current) return
    const value = result.data?.trim()
    if (!value) return
    locked.current = true
    onScan(value)
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.top}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close scanner">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Txt variant="bodyStrong" color="#fff" style={{ marginLeft: spacing.md }}>
            Scan admit card
          </Txt>
        </View>

        {!permission?.granted ? (
          <View style={styles.center}>
            <Txt variant="body" color="#fff" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
              Camera access is needed to scan barcodes in the exam hall.
            </Txt>
            <Button label="Allow camera" onPress={() => void requestPermission()} />
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8', 'pdf417', 'aztec'],
            }}
            onBarcodeScanned={handleBarCode}
          />
        )}

        <View style={styles.frame} pointerEvents="none" />
        <Txt variant="caption" color="rgba(255,255,255,0.85)" style={styles.hint}>
          Align the admit-card barcode inside the frame
        </Txt>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: {
    position: 'absolute',
    top: 48,
    left: spacing.base,
    right: spacing.base,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  frame: {
    position: 'absolute',
    alignSelf: 'center',
    top: '30%',
    width: '78%',
    height: 180,
    borderWidth: 2,
    borderColor: colors.brand,
    borderRadius: 12,
  },
  hint: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
})
