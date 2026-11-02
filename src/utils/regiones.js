// Países con sus comunidades o regiones. En los países sin lista, la región se escribe a mano.
export const REGIONES = {
    'España': ['Andalucía', 'Aragón', 'Asturias', 'Illes Balears', 'Canarias', 'Cantabria', 'Castilla-La Mancha', 'Castilla y León', 'Cataluña', 'Comunitat Valenciana', 'Extremadura', 'Galicia', 'La Rioja', 'Comunidad de Madrid', 'Región de Murcia', 'Comunidad Foral de Navarra', 'País Vasco', 'Ceuta', 'Melilla'],
    'Francia': ['Auvergne-Rhône-Alpes', 'Bourgogne-Franche-Comté', 'Bretagne', 'Centre-Val de Loire', 'Corse', 'Grand Est', 'Hauts-de-France', 'Île-de-France', 'Normandie', 'Nouvelle-Aquitaine', 'Occitanie', 'Pays de la Loire', "Provence-Alpes-Côte d'Azur"],
    'Portugal': ['Norte', 'Centro', 'Área Metropolitana de Lisboa', 'Alentejo', 'Algarve', 'Açores', 'Madeira'],
    'Italia': ['Abruzzo', 'Basilicata', 'Calabria', 'Campania', 'Emilia-Romagna', 'Friuli-Venezia Giulia', 'Lazio', 'Liguria', 'Lombardia', 'Marche', 'Molise', 'Piemonte', 'Puglia', 'Sardegna', 'Sicilia', 'Toscana', 'Trentino-Alto Adige', 'Umbria', "Valle d'Aosta", 'Veneto'],
    'Andorra': [],
    'Marruecos': [],
    'Grecia': [],
    'Suiza': [],
    'Austria': [],
    'Alemania': [],
    'Reino Unido': [],
    'Estados Unidos': [],
    'México': [],
    'Argentina': [],
    'Chile': [],
};

export const PAISES = Object.keys(REGIONES);

export const textoRegion = ({ pais, comunidad } = {}) => [comunidad, pais].filter(Boolean).join(', ');
