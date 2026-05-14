// src/context/CartContext.js
import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);

  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = async () => {
    const storedCart = await AsyncStorage.getItem('cart');
    setCart(storedCart ? JSON.parse(storedCart) : []);
  };

  const saveCart = async (newCart) => {
    setCart(newCart); // 👈 update immediately
    await AsyncStorage.setItem('cart', JSON.stringify(newCart));
  };

  const addToCart = (product) => {
    let newCart = [...cart];
    const index = newCart.findIndex((item) => item.product_id === product.product_id);

    if (index >= 0) {
      newCart[index].qty += 1;
    } else {
      newCart.push({ ...product, qty: 1 }); // 👈 use `qty` consistently
    }
    saveCart(newCart);
  };

  const increaseQty = (productId) => {
    let newCart = [...cart];
    const index = newCart.findIndex((item) => item.product_id === productId);

    if (index >= 0) {
      newCart[index].qty += 1;
      saveCart(newCart);
    }
  };

  const decreaseQty = (productId) => {
    let newCart = [...cart];
    const index = newCart.findIndex((item) => item.product_id === productId);

    if (index >= 0) {
      if (newCart[index].qty > 1) {
        newCart[index].qty -= 1;
      } else {
        newCart.splice(index, 1);
      }
      saveCart(newCart);
    }
  };

  const removeFromCart = (productId) => {
    let newCart = cart.filter((item) => item.product_id !== productId);
    saveCart(newCart);
  };

  return (
    <CartContext.Provider
      value={{ cart, setCart, addToCart, increaseQty, decreaseQty, removeFromCart }}
    >
      {children}
    </CartContext.Provider>
  );
};
