"use client"

import { useEffect, useRef } from "react"

export function ArtisticBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resizeCanvas()
    window.addEventListener("resize", resizeCanvas)

    // Warm color palette
    const warmColors = [
      "rgba(251, 146, 60, 0.15)", // orange-400
      "rgba(249, 115, 22, 0.12)", // orange-500
      "rgba(251, 113, 133, 0.15)", // rose-400
      "rgba(244, 63, 94, 0.12)", // rose-500
      "rgba(251, 207, 232, 0.18)", // pink-200
      "rgba(236, 72, 153, 0.12)", // pink-500
      "rgba(252, 211, 77, 0.15)", // amber-300
      "rgba(245, 158, 11, 0.12)", // amber-500
      "rgba(254, 215, 170, 0.18)", // orange-200
      "rgba(253, 186, 116, 0.15)", // orange-300
    ]

    // Floating orbs
    const orbs: Array<{
      x: number
      y: number
      vx: number
      vy: number
      size: number
      color: string
      opacity: number
      pulsePhase: number
    }> = []

    // Create floating orbs
    for (let i = 0; i < 12; i++) {
      orbs.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 150 + 80,
        color: warmColors[Math.floor(Math.random() * warmColors.length)],
        opacity: Math.random() * 0.6 + 0.2,
        pulsePhase: Math.random() * Math.PI * 2,
      })
    }

    // Flowing waves
    const waves: Array<{
      amplitude: number
      frequency: number
      phase: number
      speed: number
      color: string
      opacity: number
    }> = []

    for (let i = 0; i < 6; i++) {
      waves.push({
        amplitude: Math.random() * 100 + 50,
        frequency: Math.random() * 0.02 + 0.005,
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.02 + 0.01,
        color: warmColors[Math.floor(Math.random() * warmColors.length)],
        opacity: Math.random() * 0.3 + 0.1,
      })
    }

    let animationId: number
    let time = 0

    const animate = () => {
      time += 0.016

      // Clear canvas with warm gradient
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, "rgba(255, 247, 237, 1)") // orange-50
      gradient.addColorStop(0.3, "rgba(255, 241, 242, 1)") // rose-50
      gradient.addColorStop(0.7, "rgba(255, 251, 235, 1)") // amber-50
      gradient.addColorStop(1, "rgba(254, 242, 242, 1)") // red-50

      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw flowing waves
      waves.forEach((wave, index) => {
        wave.phase += wave.speed

        ctx.save()
        ctx.globalAlpha = wave.opacity
        ctx.fillStyle = wave.color

        ctx.beginPath()
        for (let x = 0; x <= canvas.width; x += 2) {
          const y =
            canvas.height * 0.5 +
            Math.sin(x * wave.frequency + wave.phase) * wave.amplitude +
            Math.sin(time * 0.5 + index) * 30
          if (x === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }
        ctx.lineTo(canvas.width, canvas.height)
        ctx.lineTo(0, canvas.height)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      })

      // Draw and update floating orbs
      orbs.forEach((orb, index) => {
        // Update position
        orb.x += orb.vx
        orb.y += orb.vy

        // Add gentle floating motion
        orb.x += Math.sin(time * 0.5 + index * 0.5) * 0.5
        orb.y += Math.cos(time * 0.3 + index * 0.7) * 0.3

        // Bounce off edges
        if (orb.x < -orb.size * 0.5) orb.x = canvas.width + orb.size * 0.5
        if (orb.x > canvas.width + orb.size * 0.5) orb.x = -orb.size * 0.5
        if (orb.y < -orb.size * 0.5) orb.y = canvas.height + orb.size * 0.5
        if (orb.y > canvas.height + orb.size * 0.5) orb.y = -orb.size * 0.5

        // Pulsing effect
        orb.pulsePhase += 0.02
        const pulseScale = 1 + Math.sin(orb.pulsePhase) * 0.1
        const currentSize = orb.size * pulseScale

        // Create radial gradient for orb
        const orbGradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, currentSize)
        orbGradient.addColorStop(0, orb.color)
        orbGradient.addColorStop(0.7, orb.color.replace(/[\d.]+\)$/g, "0.05)"))
        orbGradient.addColorStop(1, "rgba(0, 0, 0, 0)")

        // Draw orb with blur effect
        ctx.save()
        ctx.globalAlpha = orb.opacity * (0.8 + 0.2 * Math.sin(time + index))
        ctx.filter = "blur(25px)"
        ctx.fillStyle = orbGradient
        ctx.beginPath()
        ctx.arc(orb.x, orb.y, currentSize, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // Draw inner glow
        ctx.save()
        ctx.globalAlpha = orb.opacity * 0.6
        ctx.filter = "blur(8px)"
        const innerGradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, currentSize * 0.4)
        innerGradient.addColorStop(0, orb.color.replace(/[\d.]+\)$/g, "0.4)"))
        innerGradient.addColorStop(1, "rgba(0, 0, 0, 0)")
        ctx.fillStyle = innerGradient
        ctx.beginPath()
        ctx.arc(orb.x, orb.y, currentSize * 0.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })

      // Add subtle noise texture
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      for (let i = 0; i < data.length; i += 4) {
        if (Math.random() < 0.015) {
          const noise = Math.random() * 15
          data[i] = Math.min(255, data[i] + noise) // R
          data[i + 1] = Math.min(255, data[i + 1] + noise * 0.8) // G
          data[i + 2] = Math.min(255, data[i + 2] + noise * 0.6) // B
        }
      }

      ctx.putImageData(imageData, 0, 0)

      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener("resize", resizeCanvas)
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full -z-10"
      style={{ filter: "contrast(1.05) brightness(1.02)" }}
    />
  )
}
