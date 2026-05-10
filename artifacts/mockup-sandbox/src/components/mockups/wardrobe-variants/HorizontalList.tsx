import React, { useState } from 'react';

const items = [
  { id: 1, type: "Silk blouse", category: "top", color: "cream", colorHex: "#FFFDD0", season: "Spring/Summer", occasion: "Work" },
  { id: 2, type: "Tailored trousers", category: "bottom", color: "navy", colorHex: "#1B2A4A", season: "All season", occasion: "Work" },
  { id: 3, type: "Cashmere coat", category: "outerwear", color: "camel", colorHex: "#C19A6B", season: "Fall/Winter", occasion: "Casual" },
  { id: 4, type: "Midi skirt", category: "bottom", color: "beige", colorHex: "#D4C5A9", season: "All season", occasion: "Casual" },
  { id: 5, type: "Blazer", category: "top", color: "black", colorHex: "#1a1a1a", season: "All season", occasion: "Work" },
  { id: 6, type: "Ankle boots", category: "shoes", color: "brown", colorHex: "#6B4226", season: "Fall/Winter", occasion: "Casual" },
  { id: 7, type: "Wrap dress", category: "dress", color: "burgundy", colorHex: "#7D2027", season: "All season", occasion: "Event" },
  { id: 8, type: "Tote bag", category: "bag", color: "tan", colorHex: "#C19A6B", season: "All season", occasion: "Casual" },
];

const categories = ["All", "Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Jewelry"];

export function HorizontalList() {
  const [activeCategory, setActiveCategory] = useState("All");

  return (
    <div className="flex flex-col h-full w-full bg-[#F5F3F0] font-sans text-[#101826]">
      {/* Header */}
      <div className="px-5 pt-12 pb-4 flex justify-between items-center bg-[#F5F3F0]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#101826]">Wardrobe</h1>
          <p className="text-sm text-black/50 mt-1">12 items</p>
        </div>
        <button className="h-10 w-10 rounded-full bg-[#101826] flex items-center justify-center shadow-sm active:scale-95 transition-transform">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </div>

      {/* Filter Chips */}
      <div className="pl-5 pb-5 overflow-x-auto no-scrollbar">
        <div className="flex space-x-2 w-max pr-5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-[#101826] text-white"
                  : "bg-transparent border border-[rgba(16,24,38,0.15)] text-[#101826] hover:bg-black/5"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main List Area */}
      <div className="flex-1 px-5 pb-8 overflow-y-auto no-scrollbar flex flex-col space-y-2">
        <div className="mb-2">
          <h2 className="text-sm font-medium text-black/60">12 pieces in your wardrobe</h2>
        </div>
        
        {items.map((item) => (
          <button
            key={item.id}
            className="w-full flex items-center p-2 rounded-xl bg-white border border-[rgba(16,24,38,0.08)] shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] text-left active:opacity-70 transition-opacity"
          >
            {/* Thumbnail */}
            <div 
              className="h-[88px] w-[72px] rounded-lg shrink-0 flex items-center justify-center shadow-inner"
              style={{ backgroundColor: item.colorHex }}
            >
              <span className="text-xs font-medium uppercase tracking-widest mix-blend-difference text-white/70">
                {item.category.substring(0,2)}
              </span>
            </div>

            {/* Content */}
            <div className="ml-4 flex-1 flex flex-col py-1">
              <h3 className="text-[15px] font-semibold text-[#101826] leading-tight mb-1">
                {item.type}
              </h3>
              
              <div className="flex items-center space-x-1.5 mb-2">
                <div 
                  className="w-2.5 h-2.5 rounded-full border border-black/10 shadow-sm"
                  style={{ backgroundColor: item.colorHex }}
                />
                <span className="text-xs text-black/60 capitalize">{item.color}</span>
              </div>
              
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded-full bg-[#8AA39B]/20 text-[#8AA39B] text-[10px] font-medium uppercase tracking-wider">
                  {item.season}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#EACFD3]/30 text-[#A67B82] text-[10px] font-medium uppercase tracking-wider">
                  {item.occasion}
                </span>
              </div>
            </div>

            {/* Chevron */}
            <div className="px-2 text-black/20">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Global style for hiding scrollbars while allowing scroll
const styles = `
  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
`;
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.textContent = styles;
  document.head.appendChild(styleEl);
}
