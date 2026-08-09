const FadeIn = ({ children, delay = 0, variant = "fadeSlideUp", duration = 320 }) => (
  <div style={{
    animation: `${variant} ${duration}ms cubic-bezier(0.16, 1, 0.3, 1) both`,
    animationDelay: `${delay}ms`,
  }}>
    {children}
  </div>
);

export default FadeIn;