"use client"

import { useEffect, useRef } from "react"

export function AnimatedBackground() {
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

    // Color palette
    const colors = [
      "rgba(6, 182, 212, 0.1)", // cyan-500
      "rgba(59, 130, 246, 0.1)", // blue-500
      "rgba(147, 51, 234, 0.1)", // purple-600
      "rgba(236, 72, 153, 0.1)", // pink-500
      "rgba(34, 197, 94, 0.1)", // green-500
      "rgba(251, 146, 60, 0.1)", // orange-400
    ]

    // Particles
    const particles: Array<{
      x: number
      y: number
      vx: number
      vy: number
      size: number
      color: string
      opacity: number
      life: number
    }> = []

    // Create particles
    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 100 + 50,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: Math.random() * 0.5 + 0.1,
        life: Math.random() * 1000 + 500,
      })
    }

    let animationId: number
    let time = 0

    const animate = () => {
      time += 0.01

      // Clear canvas with gradient background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
      gradient.addColorStop(0, "rgba(2, 6, 23, 1)") // slate-950
      gradient.addColorStop(0.5, "rgba(15, 23, 42, 1)") // slate-900
      gradient.addColorStop(1, "rgba(30, 41, 59, 1)") // slate-800

      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Update and draw particles
      particles.forEach((particle, index) => {
        // Update position
        particle.x += particle.vx
        particle.y += particle.vy

        // Add some wave motion
        particle.x += Math.sin(time + index * 0.1) * 0.2
        particle.y += Math.cos(time + index * 0.1) * 0.2

        // Wrap around edges
        if (particle.x < -particle.size) particle.x = canvas.width + particle.size
        if (particle.x > canvas.width + particle.size) particle.x = -particle.size
        if (particle.y < -particle.size) particle.y = canvas.height + particle.size
        if (particle.y > canvas.height + particle.size) particle.y = -particle.size

        // Create gradient for particle
        const particleGradient = ctx.createRadialGradient(
          particle.x,
          particle.y,
          0,
          particle.x,
          particle.y,
          particle.size,
        )
        particleGradient.addColorStop(0, particle.color)
        particleGradient.addColorStop(1, "rgba(0, 0, 0, 0)")

        // Draw particle with blur effect
        ctx.save()
        ctx.globalAlpha = particle.opacity * (0.5 + 0.5 * Math.sin(time * 2 + index))
        ctx.filter = "blur(20px)"
        ctx.fillStyle = particleGradient
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      })

      // Add noise texture
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const data = imageData.data

      for (let i = 0; i < data.length; i += 4) {
        if (Math.random() < 0.02) {
          const noise = Math.random() * 20
          data[i] += noise // R
          data[i + 1] += noise // G
          data[i + 2] += noise // B
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
      style={{ filter: "contrast(1.1) brightness(0.9)" }}
    />
  )
}
