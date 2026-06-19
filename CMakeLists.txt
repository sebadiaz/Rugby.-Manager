cmake_minimum_required(VERSION 3.16)
project(RugbyManagerEngine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(rugby_engine STATIC
    engine/ai/JoueurAgent.cpp
)
target_include_directories(rugby_engine PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(exemple_joueur examples/exemple_joueur.cpp)
target_link_libraries(exemple_joueur PRIVATE rugby_engine)
