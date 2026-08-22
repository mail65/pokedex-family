/* PokéDex Family — Startbildschirm Parade
   Echte Pokémon-Sprites von PokeAPI + CSS-Animationen
*/

// Bekannte, ikonische Pokémon-IDs
const PARADE_POKEMON = [
  { id: 6,   name: 'Glurak'    },  // Charizard
  { id: 25,  name: 'Pikachu'   },
  { id: 150, name: 'Mewtu'     },  // Mewtwo
  { id: 143, name: 'Relaxo'    },  // Snorlax
  { id: 131, name: 'Lapras'    },
  { id: 94,  name: 'Gengar'    },
  { id: 130, name: 'Garados'   },  // Gyarados
  { id: 149, name: 'Dragoran'  },  // Dragonite
  { id: 196, name: 'Psiana'    },  // Espeon
  { id: 197, name: 'Nachtara'  },  // Umbreon
  { id: 249, name: 'Lugia'     },
  { id: 384, name: 'Rayquaza'  },
  { id: 448, name: 'Lucario'   },
  { id: 445, name: 'Knakrack'  },  // Garchomp
  { id: 248, name: 'Despotar'  },  // Tyranitar
];

// Sprite-URL (offizielle PokeAPI, kostenlos)
function spriteUrl(id) {
  // Animated Gen5 sprites — pixelig und flüssig animiert!
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
}

function createParade() {
  const container = document.getElementById('pokemon-parade');
  if (!container) return;
  container.innerHTML = '';

  // Zufällige Auswahl von 8 Pokémon
  const shuffled = [...PARADE_POKEMON].sort(() => Math.random() - 0.5).slice(0, 8);

  shuffled.forEach((poke, i) => {
    const lane = document.createElement('div');
    lane.className = 'parade-lane';

    const img = document.createElement('img');
    img.src = spriteUrl(poke.id);
    img.alt = poke.name;
    img.className = 'parade-sprite';
    img.draggable = false;

    // Jedes Pokémon bekommt eigene Spur, Geschwindigkeit, Größe
    const goRight  = i % 2 === 0;
    const duration = 6 + Math.random() * 8;        // 6–14s
    const delay    = -(Math.random() * duration);   // Sofort sichtbar
    const topPct   = 8 + (i * 11) % 80;            // Gleichmäßig verteilt
    const size     = 70 + Math.random() * 60;       // 70–130px

    lane.style.cssText = `
      top: ${topPct}%;
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
      animation-name: ${goRight ? 'parade-right' : 'parade-left'};
    `;
    img.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      transform: scaleX(${goRight ? 1 : -1});
      filter: drop-shadow(0 4px 12px rgba(0,0,0,0.4));
    `;

    // Bounce-Animation beim Laufen
    img.style.animation = `bounce ${0.4 + Math.random() * 0.3}s ease-in-out infinite alternate`;

    lane.appendChild(img);
    container.appendChild(lane);
  });
}

// Starten sobald DOM fertig
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createParade);
} else {
  createParade();
}
