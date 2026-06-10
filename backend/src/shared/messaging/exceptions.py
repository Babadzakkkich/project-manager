class MessagingError(Exception):
    pass


class ConnectionError(MessagingError):
    pass


class QueueError(MessagingError):
    pass


class PublishError(MessagingError):
    pass


class ConsumerError(MessagingError):
    pass