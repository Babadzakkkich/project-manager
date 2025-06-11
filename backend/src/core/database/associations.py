# from sqlalchemy import Table, Column, Integer, ForeignKey
# from .models import Base

# group_user_association = Table(
#     "group_user_association",
#     Base.metadata,
#     Column("group_id", Integer, ForeignKey("groups.id"), primary_key=True),
#     Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
# )

# task_user_association = Table(
#     "task_user_association",
#     Base.metadata,
#     Column("task_id", Integer, ForeignKey("tasks.id"), primary_key=True),
#     Column("user_id", Integer, ForeignKey("users.id"), primary_key=True),
# )

# project_group_association = Table(
#     "project_group",
#     Base.metadata,
#     Column("project_id", Integer, ForeignKey("projects.id"), primary_key=True),
#     Column("group_id", Integer, ForeignKey("groups.id"), primary_key=True)
# )