// src/context/AppProviders.js
import React from 'react';
import { CartProvider } from './CartContext';
import { AuthProvider } from './AuthContext';
import { PrintProvider } from './PrintContext';
import { ActiveCallProvider } from './ActiveCallContext';

export default function AppProviders({ children }) {
  return (
    <AuthProvider>
      <CartProvider>
        <PrintProvider>
          <ActiveCallProvider>
            {children}
          </ActiveCallProvider>
        </PrintProvider>
      </CartProvider>
    </AuthProvider>
  );
}
