import React, { useState } from 'react';
import { cn } from '@/lib/utils';

const items = [
  { id:1, type:"Silk blouse",      category:"top",      color:"cream",   colorHex:"#FFFDD0", season:"Spring/Summer", occasion:"Work"   },
  { id:2, type:"Tailored trousers",category:"bottom",   color:"navy",    colorHex:"#1B2A4A", season:"All season",    occasion:"Work"   },
  { id:3, type:"Cashmere coat",    category:"outerwear",color:"camel",   colorHex:"#C19A6B", season:"Fall/Winter",   occasion:"Casual" },
  { id:4, type:"Midi skirt",       category:"bottom",   color:"beige",   colorHex:"#D4C5A9", season:"All season",    occasion:"Casual" },
  { id:5, type:"Blazer",           category:"top",      color:"black",   colorHex:"#1a1a1a", season:"All season",    occasion:"Work"   },
  { id:6, type:"Ankle boots",      category:"shoes",    color:"brown",   colorHex:"#6B4226", season:"Fall/Winter",   occasion:"Casual" },
  { id:7, type:"Wrap dress",       category:"dress",    color:"burgundy",colorHex:"#7D2027", season:"All season",    occasion:"Event"  },
  { id:8, type:"Tote bag",         category:"bag",      color:"tan",     colorHex:"#C19A6B", season:"All season",    occasion:"Casual" },
];

const filters = ["All", "Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Jewelry"];

const getCategoryInitial = (category: string) => {
  switch (category.toLowerCase()) {
    case 'top': return 'T';
    case 'bottom': return 'B';
    case 'dress': return 'D';
    case 'outerwear': return 'O';
    case 'shoes': return 'S';
    case 'bag': return 'G';
    case 'jewelry': return 'J';
    default: return category.charAt(0).toUpperCase();
  }
};

export function ColumnGrid() {
  const [activeFilter, setActiveFilter] = useState("All");

  return (
    <div className="w-full max-w-md mx-auto h-full min-h-[100dvh] bg-[#F5F3F0] font-sans flex flex-col shadow-xl overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-14 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#101826]">Wardrobe</h1>
          <p className="text-sm font-medium text-[#101826]/50 mt-1">12 items</p>
        </div>
        <button className="h-12 w-12 rounded-full bg-[#101826] flex items-center justify-center text-white shadow-sm hover:bg-[#101826]/90 transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#D0B892] focus:ring-offset-2 focus:ring-offset-[#F5F3F0]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>

      {/* Filter Chips */}
      <div className="mb-6 px-6 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="flex w-max space-x-2.5 pb-2">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                "px-5 py-2 rounded-full text-sm font-medium transition-all focus:outline-none",
                activeFilter === filter
                  ? "bg-[#101826] text-white shadow-sm"
                  : "bg-transparent text-[#101826] border border-[#101826]/10 hover:border-[#101826]/30 active:bg-black/5"
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 px-6 pb-12 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="grid grid-cols-3 gap-[6px]">
          {items.map((item) => (
            <button
              key={item.id}
              className="relative aspect-square w-full rounded-lg overflow-hidden group focus:outline-none transition-transform active:scale-[0.97]"
              style={{ backgroundColor: item.colorHex }}
            >
              <div className="absolute top-1.5 left-1.5 w-[18px] h-[18px] rounded-[4px] bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                <span className="text-[9px] font-bold text-white shadow-sm drop-shadow-md leading-none">{getCategoryInitial(item.category)}</span>
              </div>
              
              <div className="absolute bottom-0 left-0 right-0 bg-white/20 backdrop-blur-md border-t border-white/20 py-1.5 px-1">
                <p className="text-[9px] text-white font-semibold tracking-wider uppercase text-center truncate drop-shadow-md">
                  {item.type}
                </p>
              </div>
              
              {/* Overlay for interaction feedback */}
              <div className="absolute inset-0 bg-black/0 group-active:bg-black/10 transition-colors pointer-events-none" />
            </button>
          ))}
        </div>
        
        <p className="text-center text-[13px] text-[#101826]/40 mt-10 mb-6 font-medium">
          Tap any piece to view details
        </p>
      </div>
    </div>
  );
}
