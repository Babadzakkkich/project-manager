class AdminError(Exception):
    pass


class AdminPermissionError(AdminError):
    pass


class AdminObjectNotFoundError(AdminError):
    pass


class AdminActionError(AdminError):
    pass