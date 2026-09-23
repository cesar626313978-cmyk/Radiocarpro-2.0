import React from 'react';

export const ShaderBackground: React.FC<{ opacity?: number }> = () => {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        backgroundColor: '#131313',
        backgroundImage: `radial-gradient(circle at 50% 0%, rgba(139, 92, 246, 0.08) 0%, transparent 60%), radial-gradient(circle at 100% 100%, rgba(78, 222, 163, 0.05) 0%, transparent 50%)`,
      }}
    />
  );
};
