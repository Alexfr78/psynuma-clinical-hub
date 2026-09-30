import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Modo privado de la agenda: oculta los datos de los pacientes para poder
 * enseñar la pantalla (p. ej. los huecos libres) sin exponer a nadie.
 * Se recuerda durante la pestaña (sessionStorage) para que una recarga no
 * vuelva a destapar los nombres delante de otra persona.
 */
const STORAGE_KEY = 'agenda-privacy-mode';

interface PrivacyModeContextValue {
  isPrivate: boolean;
  setPrivate: (value: boolean) => void;
  toggle: () => void;
}

const PrivacyModeContext = createContext<PrivacyModeContextValue>({
  isPrivate: false,
  setPrivate: () => {},
  toggle: () => {},
});

function readStored() {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function PrivacyModeProvider({ children }: { children: ReactNode }) {
  const [isPrivate, setIsPrivate] = useState(readStored);

  useEffect(() => {
    try {
      if (isPrivate) sessionStorage.setItem(STORAGE_KEY, '1');
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Sin almacenamiento el modo funciona igual, solo no sobrevive a una recarga.
    }
  }, [isPrivate]);

  const toggle = useCallback(() => setIsPrivate((value) => !value), []);

  return (
    <PrivacyModeContext.Provider value={{ isPrivate, setPrivate: setIsPrivate, toggle }}>
      {children}
    </PrivacyModeContext.Provider>
  );
}

export function usePrivacyMode() {
  return useContext(PrivacyModeContext);
}
