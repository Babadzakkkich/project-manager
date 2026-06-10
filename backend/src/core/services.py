from typing import Dict, Type, Any, Optional, Callable
from sqlalchemy.ext.asyncio import AsyncSession


class ServiceFactory:
    def __init__(self, session: AsyncSession):
        self.session = session
        self._services: Dict[str, Any] = {}
        self._initializers: Dict[str, Callable] = {}
    
    def register(self, name: str, initializer: Callable[[AsyncSession, 'ServiceFactory'], Any]) -> None:
        self._initializers[name] = initializer
    
    def get(self, name: str) -> Any:
        if name not in self._services:
            if name not in self._initializers:
                raise KeyError(f"Service '{name}' not registered")
            self._services[name] = self._initializers[name](self.session, self)
        return self._services[name]
    
    def get_or_create(self, name: str, service_class: Type, **kwargs) -> Any:
        if name not in self._services:
            self._services[name] = service_class(self.session, self, **kwargs)
        return self._services[name]
    
    def clear(self) -> None:
        self._services.clear()
    
    def has(self, name: str) -> bool:
        return name in self._initializers