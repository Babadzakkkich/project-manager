"""Исключения для модуля обмена сообщениями"""


class MessagingError(Exception):
    """Базовое исключение для messaging модуля"""
    pass


class ConnectionError(MessagingError):
    """Ошибка подключения к брокеру"""
    pass


class QueueError(MessagingError):
    """Ошибка при работе с очередью"""
    pass


class PublishError(MessagingError):
    """Ошибка при публикации сообщения"""
    pass


class ConsumerError(MessagingError):
    """Ошибка при потреблении сообщений"""
    pass