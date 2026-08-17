'use client'

import * as React from 'react'
import * as THREE from 'three'
import { useReducedMotion } from './provider'

/**
 * The objects around the headline.
 *
 * Glass solids rather than gradient blobs: the depth in the reference comes
 * from refraction and overlap, which a CSS blur cannot fake and which is the
 * difference between "designed" and "generated".
 *
 * Written against three.js directly rather than through a React renderer. Two
 * reasons, both practical: the React renderers for three augment the global
 * JSX namespace, which changes how prop types resolve in unrelated parts of
 * this application, and an imperative loop is the only way to be certain the
 * canvas stops doing work the moment it leaves the viewport.
 *
 * The environment is generated in-process from a small gradient canvas, so the
 * refractions are real reflections without downloading an HDR map.
 */

type Piece = {
  geometry: 'torus' | 'capsule' | 'sphere' | 'ring' | 'cross'
  position: [number, number, number]
  rotation: [number, number, number]
  scale: number
  color: number
  /** How strongly this piece answers the pointer. Depth, effectively. */
  depth: number
  spin: number
  /** Radians per second of the idle bob. */
  bob: number
}

/**
 * Placement is authored, not random: the pieces sit off the centre line so the
 * headline stays legible through the middle, and the two largest are on
 * opposing diagonals so the composition never balances too neatly.
 */
const PIECES: Piece[] = [
  { geometry: 'torus', position: [-3.9, 1.6, -1], rotation: [0.5, 0.3, 0], scale: 0.52, color: 0x7fd6bd, depth: 0.5, spin: 0.16, bob: 0.7 },
  { geometry: 'capsule', position: [3.8, 1.9, -1.8], rotation: [0.2, 0, -0.6], scale: 0.46, color: 0xb57ff0, depth: 0.34, spin: 0.22, bob: 0.9 },
  { geometry: 'cross', position: [4.1, -1.6, -0.4], rotation: [0.3, 0.6, 0.25], scale: 0.3, color: 0x7fd6bd, depth: 0.74, spin: 0.28, bob: 1.1 },
  { geometry: 'sphere', position: [-3.2, -2.1, 0.5], rotation: [0, 0, 0], scale: 0.34, color: 0xf0a63c, depth: 0.86, spin: 0.18, bob: 1.3 },
  { geometry: 'ring', position: [-4.6, -1.0, -2.4], rotation: [1.1, 0.2, 0.4], scale: 0.42, color: 0x4ea3f5, depth: 0.22, spin: 0.13, bob: 0.5 },
]

/*
 * The closing section's arrangement.
 *
 * Not `PIECES`. Those positions run from -4.6 to +4.1 because they were
 * authored for a canvas the full width of the hero, with the headline down the
 * middle. Reused inside the closing section's half-width column they land
 * somewhere else entirely: the left-hand pieces drift over the copy and the
 * right-hand ones are cut in half by the column's edge, which is what the
 * closing looked like.
 *
 * One object, which is what that section's composition asks for anyway — the
 * restraint is the point of it. Placed off to the lower left of its own column,
 * in the space the copy does not reach.
 */
const CLOSING_PIECES: Piece[] = [
  { geometry: 'torus', position: [-1.7, 0.35, 0], rotation: [0.55, 0.35, 0], scale: 0.78, color: 0x7fd6bd, depth: 0.5, spin: 0.14, bob: 0.6 },
]

const ARRANGEMENTS = { hero: PIECES, closing: CLOSING_PIECES }

function buildGeometry(kind: Piece['geometry']): THREE.BufferGeometry {
  switch (kind) {
    case 'torus':
      return new THREE.TorusGeometry(1, 0.42, 20, 48)
    case 'capsule':
      return new THREE.CapsuleGeometry(0.52, 1.1, 6, 20)
    case 'sphere':
      return new THREE.SphereGeometry(0.85, 32, 32)
    case 'ring':
      return new THREE.TorusGeometry(1.15, 0.14, 14, 44)
    case 'cross':
    default:
      return new THREE.BoxGeometry(2.2, 0.66, 0.66)
  }
}

/** A soft studio gradient, used only as the reflection source. */
function environmentTexture(renderer: THREE.WebGLRenderer): THREE.Texture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!

  const gradient = context.createLinearGradient(0, 0, 0, size)
  gradient.addColorStop(0, '#ffffff')
  gradient.addColorStop(0.45, '#9fb6d8')
  gradient.addColorStop(0.72, '#3d4a63')
  gradient.addColorStop(1, '#0b0b10')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)

  // Two highlights, so the glass has something specular to catch.
  context.fillStyle = 'rgba(255,255,255,0.95)'
  context.beginPath()
  context.arc(size * 0.28, size * 0.22, size * 0.1, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = 'rgba(180,210,255,0.7)'
  context.beginPath()
  context.arc(size * 0.76, size * 0.34, size * 0.07, 0, Math.PI * 2)
  context.fill()

  const source = new THREE.CanvasTexture(canvas)
  source.mapping = THREE.EquirectangularReflectionMapping
  source.colorSpace = THREE.SRGBColorSpace

  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromEquirectangular(source)
  source.dispose()
  pmrem.dispose()

  return target.texture
}

export function HeroObjects({
  className,
  arrangement = 'hero',
}: {
  className?: string
  /** Which authored placement to render. See `CLOSING_PIECES`. */
  arrangement?: keyof typeof ARRANGEMENTS
}) {
  const host = React.useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  React.useEffect(() => {
    const node = host.current
    if (!node) return
    if (typeof WebGLRenderingContext === 'undefined') return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' })
    } catch {
      // No WebGL. The composition survives without it.
      return
    }

    const narrow = window.innerWidth < 768
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const authored = ARRANGEMENTS[arrangement] ?? PIECES
    // The narrow trim exists to keep the hero's five off the type. An
    // arrangement that is already a single object has nothing to trim.
    const visiblePieces = narrow && authored.length > 3 ? authored.slice(0, 3) : authored

    // Capped rather than device-native: at this scale the extra pixels of a 3x
    // screen buy nothing and cost a great deal.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, narrow ? 1.25 : 1.5))
    renderer.setSize(Math.max(node.clientWidth, 1), Math.max(node.clientHeight, 1))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    node.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, node.clientWidth / node.clientHeight, 0.1, 100)
    camera.position.set(0, 0, 10)

    const environment = environmentTexture(renderer)
    scene.environment = environment

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xffffff, 2.1)
    key.position.set(4, 6, 5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x8fb8ff, 0.9)
    rim.position.set(-5, -2, 2)
    scene.add(rim)

    const group = new THREE.Group()
    // Below a tablet the arrangement pulls back so nothing lands on the type.
    group.scale.setScalar(narrow ? 0.62 : 1)
    scene.add(group)

    const geometries: THREE.BufferGeometry[] = []
    const materials: THREE.Material[] = []
    const meshes: { mesh: THREE.Mesh; piece: Piece; base: THREE.Vector3 }[] = []

    for (const piece of visiblePieces) {
      const geometry = buildGeometry(piece.geometry)
      geometries.push(geometry)

      // Transmission on the core physical material gives true refraction; the
      // thickness and IOR are what make it read as a solid rather than a bubble.
      const material = new THREE.MeshPhysicalMaterial({
        color: piece.color,
        transmission: 1,
        thickness: 1.5,
        ior: 1.42,
        roughness: 0.14,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        attenuationColor: new THREE.Color(piece.color),
        attenuationDistance: 2.2,
        transparent: true,
      })
      materials.push(material)

      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(...piece.position)
      mesh.rotation.set(...piece.rotation)
      mesh.scale.setScalar(piece.scale)
      group.add(mesh)
      meshes.push({ mesh, piece, base: new THREE.Vector3(...piece.position) })
    }

    const pointer = { x: 0, y: 0 }
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.y = -(event.clientY / window.innerHeight - 0.5) * 2
    }
    if (!coarse) window.addEventListener('pointermove', onPointerMove, { passive: true })

    // Nothing renders while the canvas is off screen.
    let onScreen = true
    const observer = new IntersectionObserver(
      ([entry]) => {
        onScreen = !!entry?.isIntersecting
      },
      { threshold: 0 },
    )
    observer.observe(node)

    const onResize = () => {
      const width = node.clientWidth
      const height = node.clientHeight
      if (!width || !height) return
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
      renderer.render(scene, camera)
    }
    window.addEventListener('resize', onResize)
    // Fires once as soon as the element has a box, which is what makes this
    // survive mounting before layout has settled.
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(node)

    const clock = new THREE.Clock()
    let frame = 0

    if (reduced) {
      // One still frame: the composition survives, the movement does not.
      renderer.render(scene, camera)
    }

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!onScreen) return

      const delta = Math.min(clock.getDelta(), 0.05)
      const time = clock.elapsedTime

      /*
       * Normalised scroll through THIS canvas, so the pieces part and sink as
       * the reader leaves rather than holding still behind the curtain.
       *
       * Measured from the element's own rect, not from `window.scrollY`. The
       * absolute version is only correct for a canvas that happens to live in
       * the first viewport: anywhere further down the page `scrollY` is already
       * past `innerHeight` before the section is even on screen, so `scrolled`
       * arrives pinned at 1 and the pieces render permanently sunk and spread —
       * dragged to the bottom of their column and clipped by its edge. This
       * reads identically for the hero, whose top IS the top of the document.
       */
      const rect = node.getBoundingClientRect()
      const scrolled = Math.min(
        1,
        Math.max(0, -rect.top / Math.max(window.innerHeight, 1)),
      )

      for (const { mesh, piece, base } of meshes) {
        // Damped follow. The damping factor, not the pointer, is what decides
        // whether this reads as premium or as a game.
        const damp = 1 - Math.pow(0.0018, delta)
        const spreadX = base.x * (1 + scrolled * 0.55)
        const sinkY = base.y - scrolled * 2.6

        mesh.position.x += (spreadX + pointer.x * piece.depth - mesh.position.x) * damp
        mesh.position.y +=
          (sinkY + pointer.y * piece.depth * 0.6 + Math.sin(time * piece.bob) * 0.14 -
            mesh.position.y) *
          damp

        mesh.rotation.y += delta * piece.spin + scrolled * 0.004
        mesh.rotation.x += delta * piece.spin * 0.35
      }

      renderer.render(scene, camera)
    }
    if (!reduced) tick()

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      observer.disconnect()
      window.removeEventListener('resize', onResize)
      if (!coarse) window.removeEventListener('pointermove', onPointerMove)
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      environment.dispose()
      renderer.dispose()
      node.removeChild(renderer.domElement)
    }
  }, [reduced, arrangement])

  return <div ref={host} className={className} aria-hidden />
}
