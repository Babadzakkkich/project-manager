from typing import Dict, Type, Any, Optional, Callable
from sqlalchemy.ext.asyncio import AsyncSession


class ServiceFactory:
    """
    Фабрика для создания экземпляров сервисов с поддержкой DI.
    Позволяет избежать циклических импортов и управляет жизненным циклом сервисов.
    """
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self._services: Dict[str, Any] = {}
        self._initializers: Dict[str, Callable] = {}
    
    def register(self, name: str, initializer: Callable[[AsyncSession, 'ServiceFactory'], Any]) -> None:
        """
        Регистрирует фабричную функцию для создания сервиса.
        
        Args:
            name: Имя сервиса
            initializer: Функция, которая создает экземпляр сервиса
        """
        self._initializers[name] = initializer
    
    def get(self, name: str) -> Any:
        """
        Получает или создает экземпляр сервиса по имени.
        
        Args:
            name: Имя сервиса
            
        Returns:
            Экземпляр сервиса
        """
        if name not in self._services:
            if name not in self._initializers:
                raise KeyError(f"Service '{name}' not registered")
            self._services[name] = self._initializers[name](self.session, self)
        return self._services[name]
    
    def get_or_create(self, name: str, service_class: Type, **kwargs) -> Any:
        """
        Получает или создает экземпляр сервиса по классу.
        
        Args:
            name: Имя сервиса
            service_class: Класс сервиса
            **kwargs: Дополнительные аргументы для конструктора
            
        Returns:
            Экземпляр сервиса
        """
        if name not in self._services:
            self._services[name] = service_class(self.session, self, **kwargs)
        return self._services[name]
    
    def clear(self) -> None:
        """Очищает кэш сервисов (полезно для тестов)"""
        self._services.clear()
    
    def has(self, name: str) -> bool:
        """Проверяет, зарегистрирован ли сервис"""
        return name in self._initializers