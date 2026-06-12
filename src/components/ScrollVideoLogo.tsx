import React, { useRef, useEffect, useState } from "react";

interface ScrollVideoLogoProps {
  onStart: () => void;
  invertDirection?: boolean;
}

export default function ScrollVideoLogo({ onStart, invertDirection = true }: ScrollVideoLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const targetProgress = useRef(0);
  const currentProgress = useRef(0);
  const [progressState, setProgressState] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [videoDuration, setVideoDuration] = useState(0);

  // Handle video metadata loaded
  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setVideoDuration(video.duration);
    setIsLoaded(true);
    
    // Play and immediately pause to ensure the browser initializes the video decoder for seeking
    video.play().then(() => {
      video.pause();
      if (invertDirection) {
        video.currentTime = video.duration;
      } else {
        video.currentTime = 0;
      }
    }).catch(err => {
      console.log("Video auto-play/pause failed:", err);
      if (invertDirection) {
        video.currentTime = video.duration;
      } else {
        video.currentTime = 0;
      }
    });
  };

  // Wheel and Touch Event Listeners bound to full-screen container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Mouse wheel handler
    const handleWheel = (e: WheelEvent) => {
      // Prevent default page scrolling while interacting with the intro
      e.preventDefault();
      
      const sensitivity = 0.0008; // Adjust scroll speed here
      let newProgress = targetProgress.current + e.deltaY * sensitivity;
      newProgress = Math.max(0, Math.min(1, newProgress));
      
      targetProgress.current = newProgress;
    };

    // Mobile touch swipe handlers
    let touchStartY = 0;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const currentY = e.touches[0].clientY;
        const deltaY = touchStartY - currentY; // Positive when swiping up (scrolling down)
        touchStartY = currentY;
        
        const sensitivity = 0.002; // Touch swipe sensitivity
        let newProgress = targetProgress.current + deltaY * sensitivity;
        newProgress = Math.max(0, Math.min(1, newProgress));
        
        targetProgress.current = newProgress;
        e.preventDefault(); // Block pull-to-refresh or page bouncing
      }
    };

    // Attach listeners with passive: false to allow preventDefault
    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("touchstart", handleTouchStart, { passive: true });
    container.addEventListener("touchmove", handleTouchMove, { passive: false });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  // Smooth Interpolation Bucle (Lerp)
  useEffect(() => {
    let frameId: number;
    
    const updateVideoFrame = () => {
      const video = videoRef.current;
      if (video && video.duration && !isNaN(video.duration)) {
        const diff = targetProgress.current - currentProgress.current;
        
        // Lowered threshold to 0.0001 so small scroll increments are not ignored
        if (Math.abs(diff) > 0.0001) {
          const lerpFactor = 0.12; // Slightly slower for buttery smooth cinematic motion
          currentProgress.current += diff * lerpFactor;
          
          // Clamp current progress
          currentProgress.current = Math.max(0, Math.min(1, currentProgress.current));
          
          // Map progress to video currentTime
          const mappedTime = invertDirection
            ? (1 - currentProgress.current) * video.duration
            : currentProgress.current * video.duration;
            
          // Set video time (safety bounds: 0 to duration - 0.04s)
          video.currentTime = Math.max(0, Math.min(video.duration - 0.04, mappedTime));
          setProgressState(currentProgress.current);
        }
      }
      
      frameId = requestAnimationFrame(updateVideoFrame);
    };

    frameId = requestAnimationFrame(updateVideoFrame);
    return () => cancelAnimationFrame(frameId);
  }, [invertDirection]);

  return (
    <div 
      ref={containerRef}
      className="scroll-video-logo-container"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "ns-resize",
        overflow: "hidden",
        background: "#000"
      }}
    >
      <video
        ref={videoRef}
        src="/logo.mp4"
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={handleLoadedMetadata}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          pointerEvents: "none", // Prevent native video controls or clicks
          opacity: isLoaded ? 1 : 0,
          transition: "opacity 0.8s ease"
        }}
      />

      {!isLoaded && (
        <div style={{ position: "absolute", color: "var(--text-muted)", fontSize: "16px", zIndex: 10 }}>
          Cargando visual...
        </div>
      )}

      {isLoaded && (
        <>
          {/* Subtle vignette/radial gradient to enhance contrast */}
          <div 
            style={{
              position: "absolute",
              inset: 0,
              background: "radial-gradient(circle, rgba(0,0,0,0) 40%, rgba(0,0,0,0.6) 100%)",
              pointerEvents: "none",
              zIndex: 1
            }}
          />

          {/* Mouse Scroll Indicator (Bottom Center) */}
          <div
            className="scroll-prompt-indicator"
            style={{
              position: "absolute",
              bottom: "40px",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              opacity: progressState < 0.15 ? 1 - (progressState * 6.6) : 0,
              pointerEvents: "none",
              transition: "opacity 0.3s ease",
              color: "var(--cyan)",
              textShadow: "0 0 10px rgba(0, 242, 254, 0.8)",
              zIndex: 5
            }}
          >
            {/* Animated mouse icon */}
            <div 
              className="mouse-icon"
              style={{
                width: "16px",
                height: "26px",
                border: "2px solid var(--cyan)",
                borderRadius: "10px",
                position: "relative",
                display: "flex",
                justifyContent: "center"
              }}
            >
              <div 
                className="mouse-dot"
                style={{
                  width: "4px",
                  height: "6px",
                  background: "var(--cyan)",
                  borderRadius: "50%",
                  marginTop: "4px",
                  animation: "mouse-wheel-scroll 1.5s infinite"
                }}
              />
            </div>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase" }}>
              Desplaza para desarmar
            </span>
          </div>

          {/* Comenzar button in bottom right corner */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStart();
            }}
            style={{
              position: "absolute",
              bottom: "40px",
              right: "40px",
              zIndex: 10,
              background: "linear-gradient(135deg, var(--cyan), var(--purple))",
              color: "#fff",
              border: "none",
              padding: "16px 36px",
              fontSize: "15px",
              fontWeight: 700,
              borderRadius: "30px",
              cursor: "pointer",
              boxShadow: "0 0 20px rgba(0, 242, 254, 0.4), 0 0 40px rgba(157, 78, 221, 0.2)",
              transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
              letterSpacing: "1px",
              textTransform: "uppercase"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-3px) scale(1.05)";
              e.currentTarget.style.boxShadow = "0 0 30px rgba(0, 242, 254, 0.6), 0 0 50px rgba(157, 78, 221, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "none";
              e.currentTarget.style.boxShadow = "0 0 20px rgba(0, 242, 254, 0.4), 0 0 40px rgba(157, 78, 221, 0.2)";
            }}
          >
            Comenzar
          </button>
        </>
      )}
    </div>
  );
}
