/* PokéDex Family — Startbildschirm Parade v2
   FIX: Lane-Animation + Bounce-Animation kombiniert via CSS-Klassen
*/

const PARADE_POKEMON = [
  { id: 6,   name: 'Glurak'   },
  { id: 25,  name: 'Pikachu'  },
  { id: 150, name: 'Mewtu'    },
  { id: 143, name: 'Relaxo'   },
  { id: 131, name: 'Lapras'   },
  { id: 94,  name: 'Gengar'   },
  { id: 149, name: 'Dragoran' },
  { id: 249, name: 'Lugia'    },
  { id: 384, name: 'Rayquaza' },
  { id: 448, name: 'Lucario'  },
  { id: 196, name: 'Psiana'   },
  { id: 248, name: 'Despotar' },
];

function createParade() {
  const container = document.getElementById('pokemon-parade');
  if (!container) return;
  container.innerHTML = '';

  const shuffled = [...PARADE_POKEMON].sort(() => Math.random() - 0.5).slice(0, 8);

  shuffled.forEach((poke, i) => {
    const goRight  = i % 2 === 0;
    const duration = 7 + Math.random() * 7;       // 7–14s
    const delay    = -(Math.random() * duration);  // sofort sichtbar
    const topPct   = 5 + (i * 12) % 82;
    const size     = 72 + Math.random() * 56;      // 72–128px
    const bounce   = 0.35 + Math.random() * 0.25;  // 0.35–0.6s

    // Wrapper bewegt sich horizontal
    const lane = document.createElement('div');
    lane.className = 'parade-lane';
    lane.style.cssText = `
      top: ${topPct}%;
      animation-name: ${goRight ? 'parade-right' : 'parade-left'};
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
      animation-timing-function: linear;
      animation-iteration-count: infinite;
    `;

    // Inner-Wrapper macht Bounce (separate Animation!)
    const inner = document.createElement('div');
    inner.className = 'parade-inner';
    inner.style.cssText = `
      animation-name: parade-bounce;
      animation-duration: ${bounce}s;
      animation-delay: ${delay}s;
      animation-timing-function: ease-in-out;
      animation-iteration-count: infinite;
      animation-direction: alternate;
    `;

    const img = document.createElement('img');
    img.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${poke.id}.png`;
    img.alt = poke.name;
    img.className = 'parade-sprite';
    img.draggable = false;
    img.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      transform: scaleX(${goRight ? 1 : -1});
      filter: drop-shadow(0 6px 16px rgba(0,0,0,0.45));
    `;

    inner.appendChild(img);
    lane.appendChild(inner);
    container.appendChild(lane);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createParade);
} else {
  createParade();
}
